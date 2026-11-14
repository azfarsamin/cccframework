import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { searchResearch, formatResearchContext } from "../../../lib/research-retrieval";

export const runtime = "nodejs";
export const maxDuration = 150; // Requires a Vercel deployment with >=150s function duration.
// Fail before the platform's 150-second limit, preserving any streamed text.
// A shorter response and leaner evidence payload should normally finish well before this.
const UPSTREAM_LIMIT_MS = 132000;
const MAX_OUTPUT_TOKENS = 4200; // Budget for each of the two streamed writing stages.
const AUDIT_OUTPUT_TOKENS = 1600; // Short, targeted proofing pass; never rewrites the full answer.

const HEARTBEAT_MS = 12000;
const EVIDENCE_LIMIT = 24;
const EVIDENCE_TEXT_BUDGET = 18000;
// User-authored research excerpts enrich discovery but never override Qur'anic wording.

type MorphSegment = [string, string, string];
type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
type Morphology = Record<string, MorphWord[]>;
type Corpus = Record<string, string>;
let textCache: Corpus | null = null;
let morphCache: Morphology | null = null;
let reverseCache: { roots: Map<string, Set<string>>; frequencies: Map<string, number> } | null = null;

async function getCorpus(): Promise<Corpus> {
  if (!textCache) {
    const parsed = JSON.parse(await readFile(path.join(process.cwd(), "public/data/ccc-quran-arabic.json"), "utf8")) as Corpus;
    if (Object.keys(parsed).length !== 6236 || !parsed["1:1"] || !parsed["114:6"])
      throw new Error("The local Qurʾān text is incomplete.");
    textCache = parsed;
  }
  return textCache;
}
async function getMorphology(): Promise<Morphology> {
  if (!morphCache) {
    const parsed = JSON.parse(await readFile(path.join(process.cwd(), "public/data/morphology.json"), "utf8")) as Morphology;
    if (!parsed["6:1"] || !parsed["2:282"] || !parsed["114:6"])
      throw new Error("The local morphology index is incomplete.");
    morphCache = parsed;
  }
  return morphCache;
}
function secureMatch(a: string, b: string): boolean {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
function verifyReference(ref: string, corpus: Corpus): boolean {
  return Boolean(corpus[ref]);
}
function getTags(raw: string): string[] {
  return raw.split("|").filter(Boolean);
}
function extractWordFacts(word: MorphWord, index: number): string {
  // Transcribe the corpus annotations, not a model-inferred morphological parse.
  const pieces = word.s.map(([surface, pos, raw]) => {
    const tags = getTags(raw);
    const core = tags.filter(t =>
      t === "PERF" || t === "IMPF" || t === "IMPV" || t === "PASS" || t === "ACT" ||
      t === "NOM" || t === "ACC" || t === "GEN" || t === "MS" || t === "MP" ||
      t === "FS" || t === "FP" || t === "M" || t === "F" || t === "DU" ||
      t === "INDEF" || t === "DEF" || t === "PCPL" || /^\([IVX]+\)$/.test(t) ||
      t.startsWith("MOOD:") || /^\d[MF](?:S|P|D)$/.test(t)
    );
    const type = tags.some(t => t.startsWith("STEM")) ? "stem" : tags.some(t => t.startsWith("PREFIX")) ? "prefix" : "suffix";
    return `${surface}{${pos};${type}${core.length ? ";" + core.join(",") : ""}}`;
  }).join("+");
  return `${index + 1} [root=${word.r ?? "—"};lemma=${word.l ?? "—"}] ${pieces}`;
}
function contextWindow(chapter: number, verse: number, corpus: Corpus): string[] {
  // Nearest verses first; retain extended backward context when the passage is short enough.
  const refs: string[] = [];
  for (let v = Math.max(1, verse - 9); v <= verse + 4; v++) {
    const ref = `${chapter}:${v}`;
    if (corpus[ref]) refs.push(ref);
  }
  const selected = new Set<string>([`${chapter}:${verse}`]);
  // Preserve local context first; add nearby earlier verses within an 8k-character budget.
  for (const ref of refs) {
    const v = Number(ref.split(":")[1]);
    if (Math.abs(v - verse) <= 3) selected.add(ref);
  }
  let total = [...selected].reduce((n, r) => n + corpus[r].length, 0);
  for (const ref of [...refs].reverse()) {
    if (selected.has(ref)) continue;
    const cost = corpus[ref].length;
    if (total + cost > 8000) continue;
    selected.add(ref); total += cost;
  }
  return refs.filter(ref => selected.has(ref)).map(ref => `${ref} ${corpus[ref]}`);
}
function buildReverse(morph: Morphology) {
  if (reverseCache) return reverseCache;
  const roots = new Map<string, Set<string>>();
  const frequencies = new Map<string, number>();
  for (const [ref, words] of Object.entries(morph)) {
    const unique = new Set(words.map(w => w.r).filter((r): r is string => Boolean(r)));
    for (const root of unique) {
      if (!roots.has(root)) roots.set(root, new Set());
      roots.get(root)!.add(ref);
      frequencies.set(root, (frequencies.get(root) || 0) + 1);
    }
  }
  reverseCache = { roots, frequencies };
  return reverseCache;
}
type EvidenceCandidate = { ref: string; score: number; reasons: string[]; required: boolean };
// Corpus-wide *candidate generation*, not proof of semantic relevance. Never
// substitute matching roots for a contextual investigation.
function discoveryCandidates(ref: string, corpus: Corpus, morph: Morphology): EvidenceCandidate[] {
  const focal = morph[ref] || [];
  const { roots, frequencies } = buildReverse(morph);
  const focalRoots = [...new Set(focal.map(w => w.r).filter((x): x is string => Boolean(x)))];
  const candidates = new Map<string, EvidenceCandidate>();
  const [chapter, verse] = ref.split(":").map(Number);
  function add(target: string, score: number, reason: string, required = false) {
    if (!corpus[target] || target === ref) return;
    const item = candidates.get(target) || { ref: target, score: 0, reasons: [], required: false };
    item.score += score;
    if (!item.reasons.includes(reason)) item.reasons.push(reason);
    item.required ||= required;
    candidates.set(target, item);
  }
  // Search every annotated verse for focal roots. Rare concept roots are
  // high-recall anchors, while frequent grammatical roots have low weight.
  for (const root of focalRoots) {
    const count = frequencies.get(root) || 0;
    if (!count || count > 450) continue;
    const concept = count <= 35;
    const weight = Math.log(1 + 6236 / count);
    for (const candidate of roots.get(root) || []) {
      add(candidate, concept ? 18 + weight : weight, `shared root ${root} (${count} verses)`, concept);
      if (concept) {
        const [c, v] = candidate.split(":").map(Number);
        // Neighboring statements may clarify a repeated concept without
        // repeating its root (e.g. 2:276 and 2:279 around ribā).
        for (const step of [-2, -1, 1, 2]) add(`${c}:${v + step}`, 5 / Math.abs(step), `context around ${candidate}`);
      }
    }
  }
  // Always retain the immediate surrounding text as candidate evidence.
  for (let step = -4; step <= 4; step++) if (step !== 0) {
    add(`${chapter}:${verse + step}`, 7 / Math.abs(step), "immediate context");
  }
  // Additional semantic leads are found through roots co-occurring within
  // anchored verses. This is deliberately bounded and never treated as proof.
  const anchors = [...candidates.values()].filter(c => c.required).sort((a,b) => b.score-a.score).slice(0, 32);
  const neighborRoots = new Map<string, number>();
  for (const candidate of anchors) {
    for (const root of new Set((morph[candidate.ref] || []).map(w => w.r).filter((x): x is string => Boolean(x)))) {
      if (focalRoots.includes(root) || (frequencies.get(root) || 0) > 100 || (frequencies.get(root) || 0) < 2) continue;
      neighborRoots.set(root, (neighborRoots.get(root) || 0) + 1);
    }
  }
  for (const [root, shared] of [...neighborRoots].sort((a,b)=>b[1]-a[1]).slice(0, 6)) {
    if (shared < 2) continue;
    for (const candidate of roots.get(root) || []) add(candidate, Math.min(4, shared), `co-occurs with subject anchor: ${root}`);
  }
  return [...candidates.values()].sort((a,b) => Number(b.required)-Number(a.required) || b.score-a.score || a.ref.localeCompare(b.ref));
}
function evidenceText(refs: string[], corpus: Corpus): string {
  return refs.filter(ref => corpus[ref]).map(ref => `${ref} ${corpus[ref]}`).join("\n");
}
// v7.8: evidence selection is deterministic, corpus-backed, and independent of GLM.
// Indexed authorship is used to DISCOVER references, never as textual authority.
type LexicalCoverage = { lemma: string; total: number; references: string[]; supplied: number };
type EvidencePlan = {
  references: string[];
  lexical: LexicalCoverage[];
  researchSources: { id: string; title: string; section: string }[];
  researchContext: string;
  researchReferences: string[];
  sources: Record<string, string[]>;
  candidateCount: number;
};
let lemmaReverseCache: Map<string, Set<string>> | null = null;
function lemmaReverse(morph: Morphology): Map<string, Set<string>> {
  if (lemmaReverseCache) return lemmaReverseCache;
  const lookup = new Map<string, Set<string>>();
  for (const [ref, words] of Object.entries(morph)) {
    for (const lemma of new Set(words.map(w => w.l).filter((v): v is string => Boolean(v)))) {
      if (!lookup.has(lemma)) lookup.set(lemma, new Set());
      lookup.get(lemma)!.add(ref);
    }
  }
  lemmaReverseCache = lookup;
  return lookup;
}
function isContentWord(word: MorphWord): boolean {
  return word.s.some(([, pos]) => pos === "N" || pos === "PN" || pos === "V" || pos === "ADJ");
}
async function buildEvidencePlan(ref: string, corpus: Corpus, morph: Morphology): Promise<EvidencePlan> {
  const candidates = discoveryCandidates(ref, corpus, morph);
  const scored = new Map<string, { score: number; sources: string[] }>();
  const offer = (target: string, score: number, source: string) => {
    if (!corpus[target] || target === ref) return;
    const old = scored.get(target) || { score: 0, sources: [] };
    old.score += score;
    if (!old.sources.includes(source)) old.sources.push(source);
    scored.set(target, old);
  };
  // Root matches are leads, not automatic proof; downweight them below a
  // corroborated direct citation or an exact content-lemma occurrence.
  for (const c of candidates.slice(0, 125)) offer(c.ref, Math.min(c.score, 25) / 5, c.reasons[0] || "corpus-root lead");
  const lemmaLookup = lemmaReverse(morph);
  const focalLemmas = [...new Set((morph[ref] || []).filter(isContentWord)
    .map(w => w.l).filter((v): v is string => Boolean(v)))];
  const lexical: LexicalCoverage[] = [];
  for (const lemma of focalLemmas) {
    const occurrences = [...(lemmaLookup.get(lemma) || [])].filter(r => corpus[r]).sort(compareRefs);
    if (occurrences.length < 2) continue;
    lexical.push({ lemma, total: occurrences.length, references: occurrences, supplied: 0 });
    // Exhaustive for rare lemmas. For common terms keep the *full inventory*
    // visible, but do not swamp the interpretation prompt with dozens of verses.
    const n = occurrences.length <= 16 ? occurrences.length : Math.min(12, occurrences.length);
    occurrences.filter(r => r !== ref).slice(0, n).forEach(r => offer(r, occurrences.length <= 16 ? 38 : 11, `same lemma ${lemma}`));
  }
  lexical.sort((a,b) => a.total-b.total || a.lemma.localeCompare(b.lemma));
  // Search 12 rather than 4 passages. Only a subset of high-relevance
  // non-external excerpts is included as prose; references from all 12 count.
  // This makes cited evidence discoverable even when the excerpt is too long.
  let researchContext = "No directly relevant indexed research excerpts were found.";
  let researchSources: EvidencePlan["researchSources"] = [];
  const researchCounts = new Map<string, { count: number; sections: Set<string> }>();
  try {
    const hits = await searchResearch("", ref, 12);
    const onTopic = hits.filter(h => !h.externalDiscussion);
    const proseHits = (onTopic.length ? onTopic : hits).slice(0, 7);
    researchContext = formatResearchContext(proseHits, 7200);
    researchSources = proseHits.map(h => ({ id: h.id, title: h.title, section: h.section }));
    hits.forEach(h => {
      for (const r of new Set(h.verseRefs)) {
        if (r === ref || !corpus[r]) continue;
        const old = researchCounts.get(r) || { count: 0, sections: new Set<string>() };
        old.count++;
        old.sections.add(`${h.articleId}/${h.section}`);
        researchCounts.set(r, old);
      }
    });
    // High recurrence across independently indexed passages/sections carries
    // ranking weight, but not epistemic authority. The Arabic is fetched below.
    for (const [r, v] of researchCounts) {
      offer(r, 12 + Math.min(v.count, 8) * 8 + Math.min(v.sections.size, 5) * 3,
        `research co-citation (${v.count} excerpts)`);
    }
  } catch (error) {
    console.warn("Research index unavailable; using Qur'an-only corpus", error instanceof Error ? error.message : error);
  }
  const researchReferences = [...researchCounts.keys()].sort((a,b) =>
    (researchCounts.get(b)!.count-researchCounts.get(a)!.count) || compareRefs(a,b));
  const highResearch = researchReferences.filter(r => (researchCounts.get(r)?.count || 0) >= 2).slice(0, 13);
  const rareLemma = lexical.filter(l => l.total <= 16).flatMap(l => l.references).filter(r => r !== ref).slice(0, 10);
  const majorRoot = candidates.filter(c => c.required).slice(0, 8).map(c => c.ref);
  const ranked = [...scored.entries()].sort((a,b) => b[1].score-a[1].score || compareRefs(a[0],b[0])).map(([r]) => r);
  const order = [...new Set([...rareLemma, ...highResearch, ...ranked, ...researchReferences, ...majorRoot])];
  const references: string[] = [];
  let characters = 0;
  for (const r of order) {
    const len = corpus[r]?.length || 0;
    if (!len || r === ref || references.length >= EVIDENCE_LIMIT || characters + len > EVIDENCE_TEXT_BUDGET) continue;
    references.push(r); characters += len;
  }
  for (const entry of lexical) entry.supplied = entry.references.filter(r => references.includes(r) || r === ref).length;
  const sources = Object.fromEntries(references.map(r => [r, scored.get(r)?.sources || []]));
  return { references, lexical, researchSources, researchContext,
    researchReferences, sources, candidateCount: candidates.length };
}
function compareRefs(a: string, b: string): number {
  const [ca, va] = a.split(":").map(Number); const [cb, vb] = b.split(":").map(Number);
  return ca-cb || va-vb;
}
function lexicalManifest(items: LexicalCoverage[]): string {
  return items.slice(0, 14).map(l => {
    const refs = l.references.length <= 70 ? l.references.join(", ") : l.references.slice(0, 70).join(", ") + ", ...";
    return `${l.lemma}: ${l.total} verse occurrences; ${l.supplied} supplied as full Arabic; complete/previewed refs: ${refs}`;
  }).join("\n") || "No recurring content lemmas found in the local annotations.";
}
const AUDIT_SYSTEM = `You are an evidence-grounded Qurʾān-only reviewer, not an autonomous editor. Audit the FIVE-section analysis against the supplied full Arabic focal verse, corpus morphology and verified Arabic evidence. Check conditional syntax, operative-clause coverage, invented grammatical discrepancies, misquotation, unsupported inference, and whether central supplied Qurʾānic references were ignored. Avoid claiming certainty where the lexical manifest shows incomplete full-text coverage. Distinguish morphology tags from syntactic conclusions. Do not manufacture ambiguity, infer absent verses, or invent corrections. CALIBRATION STANDARD: Treat the Qurʾānic wording, immediate context, and cumulative pan-textual evidence as the reference standard for this task. Evaluate ALL interpretations by the same affirmative evidentiary criteria, regardless of their provenance or popularity. Do not presume a repository argument or a competing reading to be correct or incorrect. Do not manufacture counterarguments or uncertainty where the supplied evidence establishes a conclusion. Identify genuine errors in any argument and distinguish demonstrated conclusions from unresolved questions. Audit provenance symmetrically: when an analysis introduces a competing meaning, require an affirmative Arabic textual, morphological or supplied lexical basis for it, not just a hypothetical possibility. When an article argues from a comparative table of morphological forms, assess the actual comparative examples rather than rejecting them solely because their topics differ or the focal lemma occurs only once. Do not presume that a representative set proves a universal rule either. Flag material unsupported alternative assertions when a correction can be grounded in supplied Arabic evidence.
Return ONLY JSON {"findings":[{"quote":"exact unique substring from analysis","issue":"specific material error","evidence_ref":"chapter:verse","evidence_quote":"exact contiguous Arabic quote from the SUPPLIED verse text","suggestion":"proposed correction"}],"unresolved":[]}. Maximum 4 findings and 2 unresolved. Evidence reference and Arabic quotation are mandatory for any finding. A lexical match does not prove a semantic claim. If no verified material error, use empty arrays. This review is advisory; the original text is not automatically overwritten.`;

const SYSTEM = `Analyze ONE Qurʾānic verse using the complete Arabic, numbered morphology, local context and PRE-DISCOVERED PAN-TEXTUAL EVIDENCE. Qurʾān-only: no hadith, tafsir, inherited reconstruction or presupposed geography.
SOURCE RULE: Indexed research is authored interpretation, NOT Qurʾānic authority. Identify each article's affirmative claim, its actual supporting argument and its cited Qurʾānic examples BEFORE evaluating it. Test the examples, including morphological comparison tables, against supplied Arabic. Attribute article conclusions and assess their strength on the merits; do not automatically adopt OR reject them. Apply identical evidence requirements to article arguments and competing interpretations. A representative pattern supports an inference but does not alone prove a universal rule.\nEVIDENCE ORDER: The primary verse first; relevant Qurʾānic passages next; grammatical/morphological annotations as fallible analytical data. Prioritize directly related concepts over common roots or superficial phrase similarities. Your conclusions must follow the cumulative evidence, not merely the focal verse.
QURʾĀNIC CALIBRATION: The Qurʾān is the reference standard. Establish what the focal Arabic, its immediate context, and the cumulative pan-textual evidence support before assessing any interpretation. Evaluate repository arguments, familiar interpretations, and model-proposed alternatives under IDENTICAL standards of affirmative evidence; neither authorship nor prevalence confers authority. Do not introduce competing interpretations merely to simulate balance, or assert uncertainty without an actual evidentiary gap. Evaluate arguments using evidence appropriate to their claim type, including comparative morphology, syntax, and relevant Qurʾānic passages. Distinguish opponents' reported claims from what the Qurʾānic narrator affirms, without prejudging any research topic. State evidence-supported conclusions plainly, and identify genuine errors in any argument. No hadith or tafsīr as doctrinal premises.
GRAMMAR: The provided morphology is tag-level evidence, not a license to invent a form; explain morphology only where supported. For an unmarked claim, qualify it. Conditional protasis includes all prerequisites before its consequence. Separate conditional in (إِنْ) from emphatic inna (إِنَّ); subjunctive after purpose lām from jussive after command lām; ordinary negation lā from prohibition lā. Do not fabricate textual variants from annotation disagreements, case endings, or romanization. Distinguish active from passive participles. Cite word numbers sparingly and accurately.
CALIBRATION: Separate (A) explicit wording of selected verse, (B) conclusions warranted by cumulative Qurʾānic evidence, (C) possible but not established. Never turn uncertainty into certainty or declare a question unresolved before checking supplied evidence. NO UNSUPPORTED COMPETING INTERPRETATIONS: Before offering an alternative meaning, cite specific affirmative supporting Arabic evidence (verse, syntax, or supplied morphological comparison) and label its provenance. Do not introduce a speculative translation from pretrained linguistic knowledge as if it were established Qurʾānic usage. If external Arabic linguistic evidence would be needed but is not supplied, say so; do not invent a citation or suggest equal evidential weight. Separate grammatical possibility from observed textual support. Do not import external narratives. Avoid unsupported legal generalizations.
EVIDENCE COVERAGE: The lexical manifest lists corpus-wide occurrences, but only marked verses have full text. Do not claim a universal lexical rule unless all relevant contexts have actually been evaluated. Assess high-priority article-cited verses, including evidence that challenges the article. When a claim concerns Form VIII or another grammatical pattern, comparative verses with DIFFERENT roots and topics are relevant if they instantiate the same form; evaluate their form and agency instead of dismissing them as topically unrelated. Distinguish a lemma-specific absence of parallels from a pattern-level absence of evidence. Explain why a directly relevant supplied example is or is not probative.
OUTPUT: Only the exact requested headings; no separate Arabic verse or translation section (already displayed in Reader). Use clean Unicode Arabic and readable prose, NEVER HTML entities or raw corpus notation. Section 3 MUST distinguish direct subject evidence from structural parallels and explain each passage's contribution and tensions. No arbitrary four-reference cap. Never say Qurʾānic evidence outside the verse is extraneous.`;

export async function POST(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  const key = process.env.CHUTES_API_KEY;
  if (!passcode) return NextResponse.json({ error: "Analysis passcode not configured." }, { status: 503 });
  if (!secureMatch(req.headers.get("x-ccc-passcode") || "", passcode))
    return NextResponse.json({ error: "Invalid analysis passcode." }, { status: 401 });
  if (!key) return NextResponse.json({ error: "Chutes API key not configured." }, { status: 503 });

  let data: { chapter?: unknown; verse?: unknown; stage?: unknown; prior?: unknown; evidence?: unknown };
  try { data = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { chapter, verse } = data;
  const stage = data.stage === "discovery" ? "discovery" : data.stage === "audit" ? "audit" : data.stage === "synthesis" ? "synthesis" : data.stage === "foundation" ? "foundation" : null;
  if (!stage) return NextResponse.json({ error: "Invalid analysis stage. Update both v7.7 files." }, { status: 400 });
  const prior = typeof data.prior === "string" ? data.prior.slice(0, 30000) : "";
  if (stage === "synthesis" && !prior.includes("## 2. Immediate context"))
    return NextResponse.json({ error: "Foundation analysis is missing. Cannot synthesize an incomplete analysis." }, { status: 400 });
  if (stage === "audit" && ![1, 2, 3, 4, 5].every(n => prior.includes(`## ${n}.`)))
    return NextResponse.json({ error: "Audit requires all five sections. Preserve the existing analysis and retry." }, { status: 400 });
  if (typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 1 || chapter > 114 ||
      typeof verse !== "number" || !Number.isInteger(verse) || verse < 1)
    return NextResponse.json({ error: "Select a valid Qurʾānic verse." }, { status: 400 });

  const ref = `${chapter}:${verse}`;
  let corpus: Corpus, morph: Morphology;
  try { [corpus, morph] = await Promise.all([getCorpus(), getMorphology()]); }
  catch (err) {
    console.error("Verse analysis local evidence failure", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Local Qurʾānic evidence unavailable; analysis was not attempted." }, { status: 503 });
  }
  if (!verifyReference(ref, corpus))
    return NextResponse.json({ error: `Verse ${ref} not found.` }, { status: 400 });
  const focalMorph = morph[ref];
  if (!focalMorph?.length)
    return NextResponse.json({ error: `Morphological evidence for ${ref} is unavailable. Analysis was not attempted.` }, { status: 503 });

  const grammar = focalMorph.map(extractWordFacts).join("\n");
  const plan = await buildEvidencePlan(ref, corpus, morph);
  // Never let the browser or a generative selector erase critical references.
  // Every stage recomputes the same corpus-verified, ordered reference list.
  const evidenceRefs = plan.references;
  if (!evidenceRefs.length)
    return NextResponse.json({ error: "Insufficient verified Qur'anic evidence for analysis." }, { status: 503 });
  const evidence = evidenceText(evidenceRefs, corpus);
  const researchContext = plan.researchContext;
  const occurrenceInventory = lexicalManifest(plan.lexical);
  const requiredSections = stage === "foundation" ? [1, 2] : stage === "synthesis" ? [3, 4, 5] : [];
  const stageInstructions = stage === "foundation"
    ? `Write ONLY these headings: \n## 1. Grammar and morphology\n## 2. Immediate context\nCover 3–9 consequential grammatical constructions, especially conditionals, prohibitions, and exceptions. Describe the immediate logical context without reproducing the verse or translation. Aim for 250–450 words. Finish section 2.`
    : `Write ONLY these headings: \n## 3. Pan-textual evidence\n## 4. Interpretation and CCC\n## 5. Conclusion\nIn section 3 group evidence as direct subject-matter passages, context/qualifications, then structural comparisons; examine corroboration, scope, tensions and differences. Prioritize all essential supplied verses, not merely 4. Reconstruct and test any article comparative table from the supplied evidence; do not discard cross-root morphology examples because they have different subject matter. For each competing reading identify positive evidence and its provenance, otherwise do not present it as a coequal alternative. Section 4 separate explicit focal wording, cumulative evidence-supported implications, and plausible alternatives; discuss coherence, correspondence if externally verifiable evidence was actually supplied, and calibration. Never invent external correspondence. Aim for 450–750 words and finish section 5.`;
  const context = contextWindow(chapter, verse, corpus);
  // A single default model drives discovery, writing and review, with optional overrides.
  // This route does not control unrelated CCC discovery routes elsewhere in the repository.
  const baseModel = process.env.VERSE_ANALYSIS_MODEL || "zai-org/GLM-5.2-Fast";
  const model = (stage === "discovery" ? process.env.VERSE_ANALYSIS_DISCOVERY_MODEL : stage === "foundation" ? process.env.VERSE_ANALYSIS_FOUNDATION_MODEL
    : stage === "synthesis" ? process.env.VERSE_ANALYSIS_SYNTHESIS_MODEL
    : process.env.VERSE_ANALYSIS_AUDIT_MODEL) || baseModel;
  // Evidence discovery is now a deterministic local operation: zero Chutes
  // tokens, no JSON parsing/truncation failure, stable across repeated runs.
  if (stage === "discovery") {
    const payload = { references: evidenceRefs, candidateCount: plan.candidateCount,
      coverageGaps: plan.lexical.filter(x => x.supplied < x.total && x.total <= 16)
        .map(x => `Not every ${x.lemma} occurrence fits the evidence budget.`),
      researchSources: plan.researchSources, researchReferences: plan.researchReferences,
      lexical: plan.lexical.map(x => ({ lemma:x.lemma, total:x.total, supplied:x.supplied })),
      sources: plan.sources };
    const frames = [
      `event: evidence\ndata: ${JSON.stringify(payload)}\n\n`,
      `event: done\ndata: ${JSON.stringify({reference:ref, stage, finishReason:"deterministic", incomplete:false})}\n\n`
    ].join("");
    return new Response(frames, { status:200, headers: {
      "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control":"no-cache, no-transform",
      "X-Verse-Analysis-Protocol":"sse-v1" } });
  }
  // Stream immediately: this removes the 45-second all-at-once response constraint.
  // Every event is JSON inside a Server-Sent Events frame (not arbitrary text).
  const encoder = new TextEncoder();
  const emit = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, payload: unknown) =>
    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      const abort = new AbortController();
      let finished = false;
      let upstreamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      // Disconnects, timeouts, and cancellation all stop the upstream request.
      const onDisconnect = () => abort.abort();
      req.signal.addEventListener("abort", onDisconnect, { once: true });
      const deadline = setTimeout(() => abort.abort(), UPSTREAM_LIMIT_MS);
      const heartbeat = setInterval(() => {
        if (!finished) {
          try { emit(controller, "heartbeat", { elapsedMs: Date.now() - started }); }
          catch { abort.abort(); }
        }
      }, HEARTBEAT_MS);

      let answer = "";
      let finishReason = "";
      let reasoningTokensObserved = 0;
      let reasoningCharactersObserved = 0;
      let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
      let invalid = new Set<string>();
      const validateReferences = (text: string) => {
        const matches = [...text.matchAll(/\b(\d{1,3}):(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?\b/g)];
        for (const m of matches) {
          const first = `${m[1]}:${m[2]}`;
          if (!verifyReference(first, corpus) ||
            (m[3] && (Number(m[3]) < Number(m[2]) || Number(m[3]) - Number(m[2]) > 100 || !verifyReference(`${m[1]}:${m[3]}`, corpus)))) {
            invalid.add(m[0]);
          }
        }
      };
      const sectionCoverage = (value: string) => {
        // Accept heading numbers only at the start of a Markdown heading / line.
        const matched = new Set<number>();
        for (const m of value.matchAll(/^\s{0,3}(?:#{1,4}\s*)?([1-6])[.)]\s+[^\n]+/gm)) matched.add(Number(m[1]));
        return matched;
      };
      const finish = (event: "done" | "error", payload: Record<string, unknown>) => {
        if (finished) return;
        finished = true;
        try { emit(controller, event, payload); controller.close(); }
        catch { /* Client disconnected. */ }
      };
      try {
        emit(controller, "status", { message: `${stage === "foundation" ? "Analyzing grammar and context" : stage === "synthesis" ? "Synthesizing Qurʾānic evidence" : "Checking material claims"} for ${ref}…`, reference: ref, stage });
        const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: abort.signal,
          body: JSON.stringify({
            model, temperature: 0, max_tokens: stage === "audit" ? AUDIT_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS, stream: true,
            // Both model families can default to extended reasoning, which uses
            // completion tokens before final-answer text is produced. Apply the
            // template option appropriate to the exact selected model family.
            ...(model === "deepseek-ai/DeepSeek-V3.2-TEE"
              ? { chat_template_kwargs: { thinking_mode: "chat" } }
              : model === "zai-org/GLM-5.2-Fast" || model.startsWith("zai-org/GLM-5.2-")
                ? { chat_template_kwargs: { enable_thinking: false } }
                : {}),
            messages: [
              { role: "system", content: stage === "audit" ? AUDIT_SYSTEM : SYSTEM },
              { role: "user", content: stage === "audit"

                  ? `AUDIT ${ref}. FULL VERSE:\n${corpus[ref]}\n\nMORPHOLOGY:\n${grammar}\n\nLOCAL CONTEXT:\n${context.join("\n")}\n\nSELECTED VERIFIED PAN-TEXTUAL EVIDENCE:\n${evidence}\n\nCORPUS LEMMA COVERAGE:\n${occurrenceInventory}\n\nINDEXED RESEARCH (not primary evidence):\n${researchContext}\n\nFIVE-SECTION ANALYSIS:\n${prior}\n\nFind only evidence-grounded material errors. Your output is advisory.`
                  : `FOCAL VERSE ${ref} (full Arabic; do not reproduce as a section):\n${corpus[ref]}\n\nMORPHOLOGY (focal only):\n${grammar}\n\nLOCAL CONTEXT:\n${context.join("\n")}\n\nPAN-TEXTUAL EVIDENCE SELECTED BEFORE INTERPRETATION (full Arabic):\n${evidence}\n\nCORPUS LEMMA COVERAGE (some references are not full text):\n${occurrenceInventory}\n\nINDEXED RESEARCH (attributed arguments, not Qur'anic authority):\n${researchContext}\n\n${stage === "synthesis" ? `COMPLETED GRAMMAR AND CONTEXT (do not repeat):\n${prior}\n` : ""}\n${stageInstructions}\nUse evidence to test interpretations, not decorate a predetermined conclusion.` }
            ],
          }),
        });
        if (!response.ok) {
          console.error("Verse analysis upstream HTTP", { ref, model, status: response.status, ms: Date.now() - started });
          finish("error", { message: `Chutes returned HTTP ${response.status}.`, partial: false });
          return;
        }
        if (!response.body) {
          finish("error", { message: "Chutes returned no streaming response body.", partial: false });
          return;
        }
        emit(controller, "status", { message: "Connected to analysis model. Awaiting final-answer text…" });
        upstreamReader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = "";
        let providerDone = false;
        const handleFrame = (frame: string) => {
          const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n").trim();
          if (!data) return;
          if (data === "[DONE]") { providerDone = true; return; }
          let msg: {
            error?: { message?: string } | string;
            choices?: { delta?: { content?: string | null; reasoning_content?: string | null }; finish_reason?: string | null }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          try { msg = JSON.parse(data); } catch { return; }
          if (msg.error) throw new Error(typeof msg.error === "string" ? msg.error : msg.error.message || "Model stream error");
          if (msg.usage) usage = msg.usage;
          const choice = msg.choices?.[0];
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          // Never show private reasoning. Count it to diagnose any ignored chat-mode flag.
          const reasoning = choice?.delta?.reasoning_content;
          if (typeof reasoning === "string" && reasoning) {
            reasoningTokensObserved++;
            reasoningCharactersObserved += reasoning.length;
          }
          const delta = choice?.delta?.content;
          if (typeof delta === "string" && delta) {
            answer += delta;
            if (stage === "foundation" || stage === "synthesis") emit(controller, "delta", { text: delta }); // Audit JSON is internal until validated.
          }
        };
        while (true) {
          const { done, value } = await upstreamReader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let boundary: number;
          while (true) {
            const match = /\r?\n\r?\n/.exec(pending);
            if (!match) break;
            boundary = match.index;
            const frame = pending.slice(0, boundary).replace(/\r\n/g, "\n"); pending = pending.slice(boundary + match[0].length);
            handleFrame(frame);
          }
          if (pending.length > 2_000_000) throw new Error("Oversized provider stream frame");
        }
        pending += decoder.decode();
        if (pending.trim()) handleFrame(pending.replace(/\r\n/g, "\n"));
        if (!answer.trim()) {
          console.error("Verse analysis returned no final text", {
            ref, model, finishReason, providerDone, durationMs: Date.now() - started,
            completionTokens: usage?.completion_tokens, reasoningChunks: reasoningTokensObserved,
            reasoningCharacters: reasoningCharactersObserved,
          });
          finish("error", { message: reasoningCharactersObserved
            ? `Chutes generated reasoning but no final answer (model: ${model}; finish: ${finishReason || "unknown"}; reasoning characters: ${reasoningCharactersObserved}). Check whether this Chutes deployment honors its non-thinking setting.`
            : `Chutes returned no final-answer text (model: ${model}; finish: ${finishReason || "not provided"}). Check deployment logs and model compatibility.`, partial: false });
          return;
        }
        if (stage === "audit") {
          let parsed: { findings?: { quote?: string; issue?: string; evidence_ref?: string; evidence_quote?: string; suggestion?: string }[]; unresolved?: string[] };
          try { parsed = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
          catch { finish("error", { message: "Verification JSON invalid; original analysis retained.", partial: false }); return; }
          if (finishReason === "length" || !Array.isArray(parsed.findings) || !Array.isArray(parsed.unresolved)) {
            finish("error", { message: "Verification incomplete; original analysis retained.", partial: false }); return;
          }
          // Validation requires a verbatim quote in an ACTUAL supplied verse.
          // Never silently replace generated analytical text based on a model's
          // self-certified verdict. Report grounded findings for human review.
          const supplied = new Set([ref, ...context.map(line => line.split(" ")[0]), ...evidenceRefs]);
          const normalize = (v: string) => v.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
          const findings = (parsed.findings || []).slice(0,4).filter(item => {
            if (!item.quote || !item.issue || !item.evidence_ref || !item.evidence_quote || !item.suggestion) return false;
            if (!prior.includes(item.quote) || !supplied.has(item.evidence_ref)) return false;
            return normalize(corpus[item.evidence_ref] || "").includes(normalize(item.evidence_quote));
          }).map(item => ({ quote:item.quote!, issue:item.issue!, evidenceRef:item.evidence_ref!, evidenceQuote:item.evidence_quote!, suggestion:item.suggestion! }));
          console.info("Verse analysis verification", { ref, model, durationMs: Date.now()-started,
            proposed: parsed.findings.length, grounded: findings.length, finishReason });
          emit(controller, "audit", { findings, unresolved: parsed.unresolved.filter(x=>typeof x === "string").slice(0,2) });
          finish("done", { reference:ref, stage, finishReason, incomplete:false, durationMs: Date.now()-started, findings:findings.length });
          return;
        }
        validateReferences(answer);
        console.info("Verse analysis streamed", {
          ref, model, durationMs: Date.now() - started, finishReason,
          promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
          contentLength: answer.length, morphologyWords: focalMorph.length, evidenceVerses: evidenceRefs.length,
          providerDone, reasoningChunks: reasoningTokensObserved,
        });
        finish("done", {
          reference: ref, stage, finishReason, incomplete: finishReason === "length" || !providerDone || requiredSections.some(n => !sectionCoverage(answer).has(n)),
          completedSections: [...sectionCoverage(answer)].sort(),
          invalidReferences: [...invalid], durationMs: Date.now() - started,
        });
      } catch (err) {
        const timedOut = abort.signal.aborted && !req.signal.aborted;
        console.error("Verse analysis stream failed", {
          ref, model, durationMs: Date.now() - started,
          name: err instanceof Error ? err.name : "Unknown", message: err instanceof Error ? err.message : String(err),
          partialLength: answer.length, timedOut,
        });
        if (!req.signal.aborted) finish("error", {
          message: timedOut
            ? `Analysis exceeded the ${Math.round(UPSTREAM_LIMIT_MS / 1000)}-second server limit. ${answer ? "Partial analysis preserved below." : "No final-answer text was received."}`
            : (err instanceof Error ? err.message : "Analysis stream interrupted."),
          partial: Boolean(answer.trim()),
        });
      } finally {
        clearTimeout(deadline); clearInterval(heartbeat);
        req.signal.removeEventListener("abort", onDisconnect);
        try { await upstreamReader?.cancel(); } catch { /* upstream already closed */ }
        if (!finished) { finished = true; try { controller.close(); } catch { /* disconnected */ } }
      }
    },
    cancel() { /* Request abort signal is handled above on disconnect. */ },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "X-Verse-Analysis-Protocol": "sse-v1",
    },
  });
}

// A lightweight route check for distinguishing deployment/middleware problems from Chutes failures.
export async function GET() {
  return NextResponse.json({ service: "verse-analysis", status: "ready", version: "7.8.3" });
}
