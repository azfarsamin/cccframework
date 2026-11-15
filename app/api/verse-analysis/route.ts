import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { validateCalibrationClaims } from "../../../lib/calibration-validation";
import { deterministicGrammarSheet, validateGrammarClaims } from "../../../lib/grammar-validation";
import { reviewAnalysisQuality } from "../../../lib/analysis-quality";
import { CCC_EPISTEMIC_DIRECTIVE, CCC_REASONING_SAFEGUARDS } from "../../../lib/ccc-epistemic-directive";
import { correctionPrompt, correctedGrammarSheet } from "../../../lib/corpus-corrections";
import { searchResearch, expandResearchEvidence, neighboringResearchReferences, rankRelevantResearch, type ResearchEvidenceUnit } from "../../../lib/research-retrieval";
import { fullArticleEvidenceForVerse, findFullArticleIdsForVerse, readFullResearchArticle, readOriginalResearchSection } from "../../../lib/full-research-index";

export const runtime = "nodejs";
// 300s with Vercel Fluid Compute works on Hobby and higher plans. Pro/Enterprise
// may raise this to 800s after confirming the project's runtime entitlement.
// Each stage is a SEPARATE request; the browser orchestrates them sequentially.
export const maxDuration = 300;
const UPSTREAM_LIMIT_MS = 270000; // Keep 30s for SSE completion and cleanup.
const MAX_OUTPUT_TOKENS = 4200; // Non-reasoning model default.
const AUDIT_OUTPUT_TOKENS = 3000;
const RECONSTRUCTION_OUTPUT_TOKENS = 3400;
// DeepSeek V4 Pro counts private reasoning and visible text in the SAME budget.
// Give its reconstruction and verification stages headroom without streaming reasoning.
const PRO_RECONSTRUCTION_TOKENS = 10000;
const PRO_WRITING_TOKENS = 16000;
const PRO_AUDIT_TOKENS = 9000;

const HEARTBEAT_MS = 12000;
const EVIDENCE_LIMIT = 36;
const EVIDENCE_TEXT_BUDGET = 24000;
// Pilot-specific narrative parallels are retrieval requirements, not predetermined interpretations.
// Supply their COMPLETE Arabic before selecting lower-priority root or lemma leads.
const ESSENTIAL_NARRATIVE_PARALLELS: Record<string,string[]> = {
  "2:30": ["7:11", "38:71", "38:72", "38:73", "21:20"],
  "28:10": ["22:46", "7:179"],
  "22:46": ["7:179", "28:10"],
  "25:5": ["29:48", "2:78"],
  "2:78": ["3:20", "3:75", "7:157", "7:158", "62:2"],
  "17:36": ["49:6", "39:18"]
};
const RESEARCH_TEXT_BUDGET = 21000;
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
  researchSources: { id: string; title: string; section: string; complete: boolean; parts: number }[];
  researchUnits: ResearchEvidenceUnit[];
  researchContext: string;
  researchReferences: string[];
  rejectedResearch: string[];
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
    const n = occurrences.length <= 24 ? occurrences.length : Math.min(12, occurrences.length);
    occurrences.filter(r => r !== ref).slice(0, n).forEach(r => offer(r, occurrences.length <= 24 ? 38 : 11, `same lemma ${lemma}`));
  }
  lexical.sort((a,b) => a.total-b.total || a.lemma.localeCompare(b.lemma));
  // Search 12 rather than 4 passages. Only a subset of high-relevance
  // non-external excerpts is included as prose; references from all 12 count.
  // This makes cited evidence discoverable even when the excerpt is too long.
  let researchContext = "No directly relevant indexed research excerpts were found.";
  let researchSources: EvidencePlan["researchSources"] = [];
  let researchUnits: ResearchEvidenceUnit[] = [];
  let rejectedResearch: string[] = [];
  let linkedResearch: string[] = [];
  const researchCounts = new Map<string, { count: number; sections: Set<string> }>();
  try {
    // Expand each relevant research SECTION before requesting a model opinion.
    // This restores tables and premises that were split across indexed chunks.
    const hits = await searchResearch("", ref, 12);
    const onTopic = hits.filter(h => !h.externalDiscussion);
    const expanded = await expandResearchEvidence(onTopic.length ? onTopic : hits, 8, RESEARCH_TEXT_BUDGET);
    const chosen = rankRelevantResearch(ref, expanded, 3);
    researchUnits = chosen.accepted;
    rejectedResearch = chosen.rejected.map(u => `${u.title} — ${u.section}`);
    researchContext = researchUnits.length
      ? researchUnits.map(u =>
          `[Research unit ${u.key}; ${u.complete ? "complete section" : "TRUNCATED SECTION"}; ${u.chunkIds.length} indexed parts; verses: ${u.verseRefs.join(", ")}]\n${u.title} — ${u.section}\n${u.text}`
        ).join("\n\n")
      : "No directly relevant indexed research sections were found.";
    researchSources = researchUnits.map(u => ({ id:u.key,title:u.title,section:u.section,
      complete:u.complete,parts:u.chunkIds.length }));
    // Complete-article linkage (schema v2): the *whole* indexed source is
    // available, even when only several sections fit the inference context.
    // Cross-section citations are discovery leads, NEVER proof of author claims.
    // This prevents the focal-verse citation gate from severing related premises.
    // Add newly indexed sources without editing the legacy chunk index.
    // An article enters by an explicit focal reference, never a doctrine bonus.
    const fullIds=[...new Set([...researchUnits.map(u => u.articleId),
      ...findFullArticleIdsForVerse(ref,2)])];
    const fullEvidence = fullArticleEvidenceForVerse(ref,fullIds,36);
    // Source-aware inclusion for new works: never claim the content was read
    // when only its citations/headings were included. Keep sections together.
    for(const id of fullIds.filter(id=>!researchUnits.some(u=>u.articleId===id))){
      const article=readFullResearchArticle(id);
      if(!article)continue;
      for(const sectionId of (article.verse_to_sections[ref]||[]).slice(0,2)){
        const original=readOriginalResearchSection(id,sectionId);
        if(!original)continue;
        const allowance=4500;
        const complete=original.originalText.length<=allowance;
        const text=complete?original.originalText:original.originalText.slice(0,allowance);
        const citationFrequency:Record<string,number>={};
        for(const verse of original.section.verse_refs)citationFrequency[verse]=1;
        researchUnits.push({key:sectionId,articleId:id,title:article.title,
          section:original.section.heading,text,verseRefs:original.section.verse_refs,
          citationFrequency,chunkIds:[sectionId],complete,score:20});
        researchContext += `\n\n[Complete-source section ${sectionId}; ${complete?'complete':'TRUNCATED'}; verses: ${original.section.verse_refs.join(', ')}]\n${text}`;
        researchSources.push({id:sectionId,title:article.title,section:original.section.heading,complete,parts:1});
      }
    }
    const sectionNavigation = fullEvidence.articles.map(a => {
      const anchors = a.sections.filter(s => a.directSections.includes(s.id));
      return `[COMPLETE SOURCE INDEX: ${a.title}; ${a.totalSections} sections, source hash ${a.sourceSha256.slice(0,12)}; focal sections: ${anchors.map(s=>s.heading).join(' | ') || 'none'}; additional headings/verse citations remain indexed for retrieval. A citation lead is not a fully read section.]`;
    });
    researchContext += "\n\n" + sectionNavigation.join("\n");
    for (const entry of fullEvidence.references) {
      if (!corpus[entry.ref] || entry.ref === ref) continue;
      offer(entry.ref, Math.min(36, 3 + entry.score * 2),
        `full-article cross-section citation (${entry.sections.length} sections)`);
      const old = researchCounts.get(entry.ref) || {count:0,sections:new Set<string>()};
      old.count += Math.min(3,entry.score);
      entry.sections.forEach(s=>old.sections.add(s));
      researchCounts.set(entry.ref,old);
    }

    // Adjacent sections may be useful leads but cannot override directly cited
    // passages. They never supply claims to the argument reconstruction.
    linkedResearch = (await neighboringResearchReferences(researchUnits, 1, 6)).filter(r => r !== ref && Boolean(corpus[r]));
    for (const r of linkedResearch) offer(r, 3, "neighboring research citation lead");
    // Include citations from the complete restored sections, not just from
    // individually retrieved snippets. Parsing in-text references catches
    // references that were omitted from an individual chunk's metadata.
    for (const u of researchUnits) {
      const citations = new Set([...u.verseRefs, ...[...u.text.matchAll(/\b(\d{1,3}:\d{1,3})\b/g)].map(m=>m[1])]);
      for (const cited of citations) {
        if (cited === ref || !corpus[cited]) continue;
        const old = researchCounts.get(cited) || { count:0, sections:new Set<string>() };
        old.count += Math.min(4, u.citationFrequency[cited] || 1);
        old.sections.add(u.key);
        researchCounts.set(cited,old);
      }
    }
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
  // Allocate evidence by ARGUMENT RELEVANCE, not by the length of a common
  // word's occurrence list. The previous all-occurrences-first policy let
  // junah (24 verses) displace dayn (3) and qarḍ references in Q 2:282.
  // Conversely, a focal verse with a small number of content lemmas (e.g.
  // Q 33:34, hikma) should still receive their complete occurrence sets.
  const rankedResearch = researchReferences.slice(0, 8);
  // Guarantee a small number of DIRECT citations from each restored research
  // section, so an unrelated high-frequency vocabulary set cannot erase a
  // distinct argument such as qarḍ while analyzing dayn.
  const diverseResearch = researchUnits.flatMap(u =>
    u.verseRefs.filter(r => r !== ref && Boolean(corpus[r])).slice(0, 2));
  const conceptFamilies = lexical.filter(l => l.total >= 2 && l.total <= 32)
    .map(l => {
      // Centrality depends on how many *different* cited verses contain the
      // lemma, not frequency of an article's repeated citations. Small common
      // epithets must not displace a topical lemma such as hikma or hadith.
      const cited = l.references.filter(r => researchCounts.has(r)).length;
      const priority = cited * 8 + (cited >= 3 ? 25 : 0) + 12 / Math.sqrt(l.total);
      return { ...l, priority };
    }).sort((a,b) => b.priority-a.priority || a.total-b.total || a.lemma.localeCompare(b.lemma));
  // Priority tiers: (1) explicit citations in relevant research; (2) the
  // complete occurrence set for a small *central* lemma; (3) other rare
  // content lemmas; (4) neighborhood/root-discovery leads. This prevents a
  // 19-occurrence topic lemma being crowded out by unrelated grammatical words.
  const central = conceptFamilies.filter(f => f.priority >= 36).slice(0, 2);
  const remainingFamilies = conceptFamilies.filter(f => !central.includes(f));
  const centralRefs = central.flatMap(f => f.references.filter(r => r !== ref));
  const breadthRefs = remainingFamilies.flatMap(f => f.references.filter(r => r !== ref).slice(0, 2));
  const majorRoot = candidates.filter(c => c.required).slice(0, 8).map(c => c.ref);
  const ranked = [...scored.entries()].sort((a,b) => b[1].score-a[1].score || compareRefs(a[0],b[0])).map(([r]) => r);
  const essentials = (ESSENTIAL_NARRATIVE_PARALLELS[ref] || []).filter(r => Boolean(corpus[r]) && r !== ref);
  const order = [...new Set([
    ...essentials, ...rankedResearch, ...centralRefs, ...researchReferences.slice(8,12), ...diverseResearch,
    ...breadthRefs, ...ranked, ...linkedResearch.slice(0, 3), ...majorRoot
  ])];
  const references: string[] = [];
  let characters = 0;
  for (const r of order) {
    const len = corpus[r]?.length || 0;
    if (!len || r === ref || references.length >= EVIDENCE_LIMIT || characters + len > EVIDENCE_TEXT_BUDGET) continue;
    references.push(r); characters += len;
  }
  for (const entry of lexical) entry.supplied = entry.references.filter(r => references.includes(r) || r === ref).length;
  const missingEssentials = essentials.filter(r => !references.includes(r));
  if (missingEssentials.length) console.warn("Essential comparison verses exceeded evidence budget", {ref,missingEssentials});
  const sources = Object.fromEntries(references.map(r => [r, scored.get(r)?.sources || (essentials.includes(r) ? ["essential narrative comparison"] : [])]));
  return { references, lexical, researchSources, researchUnits, researchContext,
    researchReferences, rejectedResearch, sources, candidateCount: candidates.length };
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
// Comparative morphology is relevant across roots and subject matters. Supply
// annotation facts for cited patterns, not merely the focal word's tag.
function comparativeMorphology(units: ResearchEvidenceUnit[], morph: Morphology, refs: string[]): string {
  const patterns = new Set<string>();
  for (const unit of units) {
    if (!/\b(?:form|pattern|stem)\s+(?:VIII|VII|VI|V|IV|III|II|IX|X)\b/i.test(unit.text)) continue;
    for (const match of unit.text.matchAll(/\b(?:form|pattern|stem)\s+(VIII|VII|VI|V|IV|III|II|IX|X)\b/gi)) {
      patterns.add(`(${match[1].toUpperCase()})`);
    }
  }
  if (!patterns.size) return "No comparative verbal-form argument was retrieved.";
  const ordered = [...new Set(units.flatMap(u=>u.verseRefs).filter(r=>refs.includes(r)))];
  const lines: string[] = [];
  for (const ref of ordered) {
    for (const [i,word] of (morph[ref] || []).entries()) {
      if (!word.s.some(([,pos,tags])=> pos === "V" && [...patterns].some(p=>getTags(tags).includes(p)))) continue;
      lines.push(`${ref}, word ${extractWordFacts(word,i)}`);
      if (lines.length >= 24) break;
    }
    if (lines.length >= 24) break;
  }
  return lines.join("\n") || "Relevant form patterns were named, but no matching annotated word was found in the selected full-text verses.";
}

type ReconstructedClaim = {
  claim: string; source: string; premises: string[]; evidenceRefs: string[];
  status: "textual" | "inference" | "external";
};
type Reconstruction = { claims: ReconstructedClaim[]; issue: string; disputed: string[]; notNecessarilyDisputed: string[] };
function parseReconstruction(raw: string, allowed: Set<string>): Reconstruction | null {
  let data: unknown;
  try { data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); }
  catch { return null; }
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.claims) || !obj.claims.length || typeof obj.issue !== "string") return null;
  const claims: ReconstructedClaim[] = [];
  for (const value of obj.claims.slice(0, 4)) {
    if (!value || typeof value !== "object") continue;
    const c = value as Record<string, unknown>;
    if (typeof c.claim !== "string" || !c.claim.trim() || typeof c.source !== "string" || !c.source.trim()) continue;
    const premises = Array.isArray(c.premises) ? c.premises.filter((x): x is string => typeof x === "string").slice(0,5) : [];
    const evidenceRefs = Array.isArray(c.evidenceRefs) ? c.evidenceRefs.filter((x): x is string => typeof x === "string" && allowed.has(x)).slice(0,12) : [];
    const status = c.status === "textual" || c.status === "external" ? c.status : "inference";
    claims.push({claim:c.claim.slice(0,600),source:c.source.slice(0,260),premises,evidenceRefs,status});
  }
  if (!claims.length) return null;
  const clean = (v:unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0,5) : [];
  return {claims,issue:obj.issue.slice(0,800),disputed:clean(obj.disputed),notNecessarilyDisputed:clean(obj.notNecessarilyDisputed)};
}

// Extract a complete JSON object, tolerating a model's accidental markdown fence
// or leading/trailing commentary. Never repair or infer missing JSON fields.
function parseStructuredObject(raw: string): Record<string, unknown> | null {
  const candidate = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed: unknown = JSON.parse(candidate);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { /* Attempt to isolate one complete JSON object without synthesizing content. */ }
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0, quoted = false, escaped = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) {
      try {
        const parsed: unknown = JSON.parse(candidate.slice(start, i + 1));
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
      } catch { return null; }
    }
  }
  return null;
}

const RECONSTRUCTION_SYSTEM = `Reconstruct a Qurʾān-centric research argument accurately, BEFORE evaluating it. Work from the focal Arabic and full RESTORED research sections (including complete tables and cited comparison examples). You are not an advocate for either the repository or a mainstream interpretation. Do not critique, refute, agree, or invent competing interpretations in this stage. State the exact conclusion each relevant article argues for, its distinct supporting premises, and the affirmative Qurʾānic passages cited. Explain what a reported accusation or rebuttal actually disputes, separately from any associated actions, assumptions or implications; do not assert that an implicit action is historically verified without supporting evidence. Distinguish actual claims about grammar, logic, and history. Treat cross-root comparisons as relevant to derivational morphology. Preserve distinctions between explicit scriptural wording and author inferences. If the source section is marked truncated, state that it is incomplete rather than claiming evidence is absent. Use supplied text and verified references. Hadith, tafsīr and other external material in RESTORED research sections may be reconstructed as evidence CLAIMS under Correspondence, never as independent doctrinal authority. Do not erase the author’s external comparisons.
Return ONLY compact JSON with keys: {"issue":"the exact interpretive dispute","claims":[{"claim":"faithful affirmative proposition","source":"research section title or focal verse","premises":["supporting observation","inferential link"],"evidenceRefs":["chapter:verse"],"status":"textual|inference|external"}],"disputed":["what competing assertions actually contest"],"notNecessarilyDisputed":["what a rebuttal does NOT by itself negate"]}. Max 4 claims, up to 3 concise premises per claim and 6 evidenceRefs per claim; up to 3 brief items in each disputed list. Each claim <= 35 words; each premise <= 20 words. Keep all JSON compact (ideally under 1300 output tokens). Do not repeat the supplied texts, add commentary, use markdown fences, or provide a verdict.`;

const AUDIT_SYSTEM = `MANDATORY PRESENTATION AND SYNTAX CHECK: Flag exposed raw Buckwalter lemma identifiers or backend terms (manifest, chunk, coverage telemetry). Flag any claim that فِي الْأَرْضِ governs the accusative خَلِيفَةً; that a feminine-patterned form cannot refer to a man; that خَلِيفَة is an "ء-pattern noun"; or that the six جَاعِل occurrences all concern appointment to a human role (18:8 is a counterexample). Distinguish 2:33's knowledge demonstration from the unspecified concealed matters.
QURʾĀN-CENTRIC SEMANTIC AUDIT: For competing meanings, cite the affirmative Arabic contextual evidence for each meaning; neither conventional translation nor the indexed author's conclusion receives a presumption. For claims of two distinct Qurʾānic faculties or categories, test the SAME-SCENE contrast, repeated subject/predicate clusters, and any counterexamples before deciding whether the distinction is functional, contextual, synonymous, or exclusive. A word's non-occurrence with one predicate is not proof of semantic impossibility; test the full lemma set and distinguish verse counts from token counts. The ability to share a function does not establish synonymy, and lexical distinction alone does not demonstrate total functional separation. When the article describes perception, reasoning, knowledge, emotion and belief, identify the ACTUAL predicates and the semantic roles the verses assign; do not import contemporary neuroanatomy as a correcting standard or infer empirical physiology from theological imagery. Claims such as 'never', 'only', 'always', and 'all' require coverage and counterexample checks; partial retrieval does not authorize universal declarations.
Verify root claims by separately identifying the two words and their roots; semantic opposition or parallel meaning does not imply one triliteral root. If a reported word or root is not in the supplied Arabic, do not invent it. Feature validation: check explicitly named verbs against actual person, number, gender, aspect and governing syntax. Do not infer recurrence or habitual conduct from imperfect aspect alone; a single ongoing event may be imperfect. Separate a personal vow or abstention from claiming divine legislation binding others, unless the text establishes that broader act. The immediate continuation of a passage can support a strong inference without making it explicit; consider 66:1–2 and their oath-release connection as a GENERAL example of this methodological distinction, not as a preordained doctrinal conclusion. Evaluate all passages using the same method.
INDEPENDENT CALIBRATION AUDIT: Explicitly test whether a purported objection addresses the reconstructed proposition or silently substitutes a stronger universal proposition. For 25:5-type Form VIII analyses, do not conclude that a procurement/causative lexical sense is impossible merely because the stem is not Form II/IV. For reported speech, reject neither all incidental historical information nor accept it as verified simply due to its occurrence in an allegation. Distinguish (A) authentic historical report, (B) truthful ordinary testimony, and (C) independently binding divine legislation. None entails the next automatically. A normative Qurʾānic criterion can apply to future institutions even when they are not named. Test whether a later authority claim meets that criterion; do not reject applicability merely because the institution postdates the verse. A hypothetical alternative needs positive evidence before it may reduce a well-supported conclusion. Equally, do not turn absence of authorization into a blanket prohibition of truthful history. Check for subject-switch claims justified solely by identical 3MS morphology, and require positive syntactic context for an alternative antecedent. If a topic-relevant Qurʾānic restriction is affirmative, do not reclassify it as mere silence.
You are a Qurʾān-centric proof-checker. The Qurʾān's text is the primary calibration standard; indexed articles are researched arguments and do not inherit authority merely from authorship. Evaluate ALL claims using identical proof obligations, without artificial balance or defensive objections.
Check the completed analysis against FULL Arabic, annotated morphology (including reviewed local corrections), contextual passages, restored full research sections, and the prior neutral argument reconstruction. Audit the strongest ACTUAL supporting argument before claiming a contradiction. Test the source argument at its actual scope rather than substituting a universal claim. Distinguish divine origin of legislation from the messenger’s revelation-dependent transmission or implementation. A plausible motive, adjacent oath reference, or other context does not alone prove a specific event mechanism; do not call an inference compelled without excluding plausible alternatives. Check every claim of a shared Arabic root against both terms. To label a claim contradicted, identify (1) the exact proposition, (2) the exact affirmative contrary evidence, and (3) why both propositions cannot be true simultaneously. Mere alternatives, absence of a second identical lemma, transitivity versus self-directed semantics, or an unsupported possibility do not by themselves prove a contradiction. A rebuttal of one aspect of reported speech does not automatically rebut every associated activity; separate WHAT is contested from WHAT is established. Do not promote the converse mistake of treating the unchallenged portion of hostile speech as independently verified history. Cross-root examples are relevant to pattern-level morphology; a representative set cannot prove a universal rule. Distinguish provenance: supplied full Arabic, research assertions, and model background knowledge. Never invent verses, lexical evidence, or external citations. Findings are advisory only.
Return ONLY compact, valid JSON {"findings":[{"quote":"short exact substring of analysis","issue":"specific material error","evidence_kind":"quran|research|reconstruction","evidence_ref":"chapter:verse OR source unit key OR reconstruction","evidence_quote":"short verbatim source excerpt","suggestion":"short precise correction"}],"unresolved":[]}. Max 2 findings and 2 unresolved. Each text value <= 240 characters. No markdown, no commentary, no repeated analysis. Prefer {"findings":[],"unresolved":[]} when no independently substantiated material error. Valid evidence is (a) verbatim Arabic from a supplied Qurʾānic verse, (b) verbatim quoted text from a RESTORED research section, or (c) verbatim text of the VALIDATED reconstruction. An objection to the article's actual claim can cite research evidence; do not falsely assert its table was absent. Use empty arrays when there are no substantiated material errors. For morphology, distinguish syntactic transitivity from reflexivity and distinguish a negative particle from a conditional particle by the clause syntax; do not infer semantic age from gender/number agreement.`;

const SYSTEM = `PAN-TEXTUAL CONCEPT TEST: First identify what the Arabic positively predicates of each term. When two related words occur in the SAME verse, distinguish their syntactic roles and the action/state assigned to each; prioritize this direct contrast over an unsupported inherited synonym. Test the pattern across all available relevant occurrences, including passages that might challenge the proposed distinction. Evaluate competing explanations using the SAME evidentiary standard. Do not invent an equally likely traditional interpretation without affirmative Arabic evidence. Also, avoid the converse error: co-occurrence or a distinctive example can support functional difference without proving the concepts never overlap. If a source argues a closed Qurʾānic system of perceptual and moral faculties, reconstruct its cumulative chain before checking each step; treat claims of exclusivity and psychological mechanism as distinct inferences from actual textual predicates. Do not silently equate qalb, fuʾād, ṣadr, nafs, samʿ and baṣar simply because an English translation uses 'heart' or 'mind'. Do not treat the modern physiological account as the default measure of Qurʾānic moral language; discuss external physiology only where the research question requires it. The research's CCC mapping (deduction/induction/abduction) is an analytical framework, not a verse's direct wording. Do not turn an internal semantic distinction into a claim that two anatomical organs have been proven.
GRAMMATICAL CALIBRATION: Do not assert two expressions share a root unless separately confirmed from their actual Arabic roots. Distinguish semantic association from derivational morphology; an alleged opposite may have a different root. Do not infer exclusive scripture authority from a generic noun or grammatical coordination alone; inspect what each verse positively authorizes. For Quranic claims about messenger obedience, distinguish direct contemporaneous obedience, revelational source, and later attribution to a posthumous corpus. Keep absence of explicit canon authorization distinct from demonstrating impossibility. Identify person, number, gender and verbal form for the actual named token; do not confuse a verb's subject with the following plural addressees. Imperfect morphology alone does not establish repeated or habitual conduct; test the immediate discourse. Distinguish (a) personal abstention, (b) a religious claim of prohibition, and (c) binding legislation for others without collapsing them. Adjacent verses may provide strong contextual inference without supplying an explicit identity claim. Treat a research article's interpretation as the proposition to test, not as fact already proved. A positive functional contrast and a claim of total non-overlap are different propositions: weigh the former without assuming the latter. Only report complete lexical coverage when all lemma occurrences have been supplied and examined. These are general rules for every passage, not verse-specific verdicts.
LOGICAL CALIBRATION: Preserve the precise question being investigated, and rank alternatives by affirmative evidence; do not grant an alternative standing simply because it is conceivable or traditional. Separate historical recording from independent divine norm-making. A general Qurʾānic criterion is capable of applying to later institutions without naming them. Context establishes meaning; it does not by itself impose an expiry date on a principle. Where a messenger expressly follows revelation only, distinguish that positive restriction from mere non-mention of later literature. Do not overstate a Qurʾānic statement as prohibiting ordinary truthful speech or history. Explicit statements, cumulative inference and true unknowns must receive distinct confidence.
READER-FACING WRITING RULES: Never print backend identifiers or provenance implementation names (e.g. Buckwalter, manifest, xaliyfap, jaAEil, >afosadu, jEl, internal lemma ids, retrieval window, chunk). Use Arabic script and standard scholarly transliteration (e.g. jāʿil, khalīfa, fasād, safk); the supplied romanized corpus identifiers are search keys ONLY, not publishable transliteration. Keep evidentiary limitations in natural language, and cite concrete passages examined. Do not include raw coverage telemetry or lists of internal keys in interpretation/calibration. Check Arabic dependency: فِي الْأَرْضِ is a locative phrase; it does NOT govern the accusative خَلِيفَةً, the active participle جَاعِلٌ licenses its object. Lexical grammatical gender and the word-final tāʾ marbūṭa cannot be treated as an automatic contradiction, and do not invent an "ء-pattern" classification. Compare predicate meanings individually: 18:8 is making the earth bare, not appointment to an office. A possible implication about Adam's descendants must be labelled an inference. Do not conflate God's knowledge of what the angels concealed (2:33) with a specification of the precise concealed contents.
Analyze one Qurʾānic verse through grammar, immediate context, complete relevant Qurʾānic comparisons, and CCC (coherence, correspondence, calibration). Qurʾān-alone interpretive and doctrinal authority. External hadith, tafsīr, manuscripts and historical evidence supplied in indexed research may be examined as claims on the Correspondence axis, NEVER as independent doctrinal authorities. Neither mainstream traditions nor the research author enjoy presumptive evidentiary superiority.
FOLLOW THE RECONSTRUCTED ARGUMENT: Before reaching a verdict examine the actual premises and comparative evidence in the supplied RESTORED research sections. Do not shrink a pattern-level argument into a demand for a second identical lemma. Comparative morphology across roots and different topics may be directly probative of a form's function. Do not dismiss a table without testing the listed forms against the supplied morphological data. A representative table supports an inference, not automatically a universal proposition. Distinguish factual corrections to a table from rejection of its entire argument.
LOGICAL TEST: For each proposed objection, identify precisely which proposition it contradicts. Check that the contrary evidence makes the proposition false, rather than merely describing a different aspect. Transitive verbs may still describe self-directed or benefactive action; assess these dimensions separately, not through category confusion. A false allegation about a thing's origin or identity need not falsify an activity associated with it; nor does the allegation alone independently establish that activity happened. Apply this general distinction to ANY reported speech. Never infer that all associated clauses share the same truth status without argument.
AFFIRMATIVE EVIDENCE: A competing interpretation requires specific affirmative Arabic evidence and transparent provenance. A hypothetical grammatical possibility is not evidence against a supported interpretation. Equally, a strong inferential preference does not establish absolute lexical impossibility. External linguistic claims must be labeled external; do not import them silently or pretend they cannot exist because a Qurʾānic word occurs once. No manufactured opposition, neutrality, or uncertainty. Identify demonstrated errors in any interpretation. Attribute certainty to the actual inferential strength.
CORPUS DQ OVERRIDES: Corrections marked correction_supported for an identified verse/token supersede raw corpus tags in the analysis; original_annotation_supported records mean the original corpus is right and the model must not contradict it. In particular in 28:10, إِنْ كَادَتْ لَتُبْدِي uses lightened emphatic inna with distinguishing lām (not conditional in); قَلْبِهَا contains a masculine singular noun with feminine possessive suffix; لِتَكُونَ is from ك و ن, not ك و د. Treat these as verified lexical/syntactic facts, NOT doctrinal conclusions. Explain any genuine conflicting annotations only in private review findings; do not present corrected tags as competing equally credible parses. GRAMMAR: Distinguish morphology tags from syntax, negating lā from prohibitive lā, conditional in from emphatic inna, active from passive, explicit agency from inferred agency. Do not invent lexical evidence from shared roots or fabricate variant readings. A conjunction does not automatically entail semantic non-identity; a singular pronoun is not automatically a proof of one single lawgiver. Morphological similarity or semantic opposition does not prove the same root. A morphological gender/number or verb-form tag does not itself prove a semantic age threshold, category exclusion, contractual ethic, or universally fixed meaning. When a corpus annotation and Arabic syntax disagree, report the conflict instead of asserting a tag is infallible. Apply the supplied local reviewed-correction register, where available, and distinguish approved grammatical corrections from unresolved candidate revisions. A source annotation is not automatically the gold standard.
EVIDENCE PROVENANCE: Explicitly distinguish focal Arabic, full supplied comparison verses, tagged morphology, source-article arguments, and unsupplied material. The lexical manifest may list occurrences not supplied in full; do not claim exhaustive semantic evaluation where coverage is partial. Immediate context and cited passages have priority over weak root parallels. Treat any truncated research section as incomplete, not absent.
OUTPUT: Respond only under the stage's prescribed headings. Stage 1 covers grammar and immediate context; stage 2 covers pan-textual comparison, CCC interpretation and conclusion. State (A) explicit wording, (B) cumulative inference and (C) genuinely undetermined matters. Assess Correspondence against external claims actually present in restored research sections or other supplied evidence; if none were supplied or retrieved, say precisely that and do not invent sources. Do not dismiss an available external claim on the basis that it lacks independent Qurʾānic authority. Use Unicode Arabic, no HTML entities.`;

export async function POST(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  const key = process.env.CHUTES_API_KEY;
  if (!passcode) return NextResponse.json({ error: "Analysis passcode not configured." }, { status: 503 });
  if (!secureMatch(req.headers.get("x-ccc-passcode") || "", passcode))
    return NextResponse.json({ error: "Invalid analysis passcode." }, { status: 401 });
  if (!key) return NextResponse.json({ error: "Chutes API key not configured." }, { status: 503 });

  let data: { chapter?: unknown; verse?: unknown; stage?: unknown; prior?: unknown; evidence?: unknown; argument?: unknown };
  try { data = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { chapter, verse } = data;
  const stage = data.stage === "reconstruction" ? "reconstruction" : data.stage === "discovery" ? "discovery" : data.stage === "audit" ? "audit" : data.stage === "synthesis" ? "synthesis" : data.stage === "foundation" ? "foundation" : null;
  if (!stage) return NextResponse.json({ error: "Invalid analysis stage. Update both v7.7 files." }, { status: 400 });
  const prior = typeof data.prior === "string" ? data.prior.slice(0, 30000) : "";
  const argumentText = typeof data.argument === "string" ? data.argument.slice(0, 15000) : "";
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
  const grammarConstraints = correctedGrammarSheet(ref, deterministicGrammarSheet(ref, morph));
  const localCorrections = correctionPrompt([ref, ...evidenceRefs]);
  const coverageGaps = plan.lexical.filter(l => l.total <= 24 && l.supplied < l.total)
    .map(l => `${l.lemma}: ${l.supplied}/${l.total} full Arabic`).slice(0,12);
  const researchContext = plan.researchContext;
  const occurrenceInventory = lexicalManifest(plan.lexical);
  const requiredSections = stage === "foundation" ? [1, 2] : stage === "synthesis" ? [3, 4, 5] : [];
  const stageInstructions = stage === "reconstruction" ? "Reconstruct the argument only, in the JSON schema. Do not reach a verdict." : stage === "foundation"
    ? `Write ONLY these headings: \n## 1. Grammar and morphology\n## 2. Immediate context\nCover 3–9 consequential grammatical constructions, especially conditionals, prohibitions, and exceptions. Describe the immediate logical context without reproducing the verse or translation. Aim for 250–450 words. Finish section 2.`
    : `Write ONLY these headings: \n## 3. Pan-textual evidence\n## 4. Interpretation and CCC\n## 5. Conclusion\nIn section 3 group evidence as direct subject-matter passages, context/qualifications, then structural comparisons; examine corroboration, scope, tensions and differences. Prioritize all essential supplied verses, not merely 4. Reconstruct and test any article comparative table from the supplied evidence; do not discard cross-root morphology examples because they have different subject matter. For each competing reading identify positive evidence and its provenance, otherwise do not present it as a coequal alternative. Section 4 separate explicit focal wording, cumulative evidence-supported implications, and plausible alternatives; discuss coherence, correspondence using any relevant external claims already supplied or retrieved from indexed research, and calibration. Do not invent external correspondence; distinguish no source supplied from retrieval omission. Aim for 450–750 words and finish section 5.`;
  const context = contextWindow(chapter, verse, corpus);
  const contextRefs = context.map(line => line.split(" ")[0]);
  const allSupplied = new Set([ref,...contextRefs,...evidenceRefs]);
  const reconstruction = stage === "foundation" || stage === "synthesis" || stage === "audit"
    ? parseReconstruction(argumentText,allSupplied) : null;
  if ((stage === "foundation" || stage === "synthesis" || stage === "audit") && !reconstruction) {
    return NextResponse.json({error:"A validated argument reconstruction is required. Update the Reader and route together to v7.9."},{status:400});
  }
  const morphologyComparisons = comparativeMorphology(plan.researchUnits,morph,[ref,...contextRefs,...evidenceRefs]);
  // A single default model drives discovery, writing and review, with optional overrides.
  // This route does not control unrelated CCC discovery routes elsewhere in the repository.
  const baseModel = process.env.VERSE_ANALYSIS_MODEL || "zai-org/GLM-5.2-Fast";
  // Reconstruction must use the tested primary model, not the verification-model override.
  // Otherwise an old VERSE_ANALYSIS_AUDIT_MODEL setting can accidentally select
  // a thinking-heavy model for this short JSON stage and exhaust its token budget.
  const model = (stage === "reconstruction" ? baseModel
    : stage === "discovery" ? process.env.VERSE_ANALYSIS_DISCOVERY_MODEL
    : stage === "foundation" ? process.env.VERSE_ANALYSIS_FOUNDATION_MODEL
    : stage === "synthesis" ? process.env.VERSE_ANALYSIS_SYNTHESIS_MODEL
    : process.env.VERSE_ANALYSIS_AUDIT_MODEL) || baseModel;
  const deepSeekV4Pro = /deepseek-v4-pro/i.test(model);
  const maxTokens = deepSeekV4Pro
    ? (stage === "audit" ? PRO_AUDIT_TOKENS : stage === "reconstruction" ? PRO_RECONSTRUCTION_TOKENS : PRO_WRITING_TOKENS)
    : (stage === "audit" ? AUDIT_OUTPUT_TOKENS : stage === "reconstruction" ? RECONSTRUCTION_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS);
  // Evidence discovery is now a deterministic local operation: zero Chutes
  // tokens, no JSON parsing/truncation failure, stable across repeated runs.
  if (stage === "discovery") {
    const payload = { references: evidenceRefs, candidateCount: plan.candidateCount,
      researchSources: plan.researchSources, researchReferences: plan.researchReferences,
      filteredResearchSections: plan.rejectedResearch,
      focalReference: ref, contextReferences: contextRefs,
      researchSections: plan.researchUnits.map(u=>({section:u.section,article:u.title,complete:u.complete,parts:u.chunkIds.length})),
      lexical: plan.lexical.map(x => ({ lemma:x.lemma, total:x.total, supplied:x.supplied })),
      coverageGaps,
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
        emit(controller, "status", { message: `${stage === "reconstruction" ? "Reconstructing article premises" : stage === "foundation" ? "Analyzing grammar and context" : stage === "synthesis" ? "Synthesizing Qurʾānic evidence" : "Checking material claims"} for ${ref}…`, reference: ref, stage });
        const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: abort.signal,
          body: JSON.stringify({
            model, temperature: 0, max_tokens: maxTokens, stream: true,
            // OpenAI-compatible Chutes deployments may support reasoning_effort;
            // stage-dependent reasoning allows the structured JSON stages to
            // finish sooner while preserving more deliberation for synthesis.
            ...(deepSeekV4Pro ? { reasoning_effort: stage === "foundation" || stage === "synthesis" ? "high" : "low" } : {}),
            // Both model families can default to extended reasoning, which uses
            // completion tokens before final-answer text is produced. Apply the
            // template option appropriate to the exact selected model family.
            ...(model === "deepseek-ai/DeepSeek-V3.2-TEE"
              ? { chat_template_kwargs: { thinking_mode: "chat" } }
              : model === "zai-org/GLM-5.2-Fast" || model.startsWith("zai-org/GLM-5.2-")
                ? { chat_template_kwargs: { enable_thinking: false } }
                : {}),
            messages: [
              { role: "system", content: `${CCC_EPISTEMIC_DIRECTIVE}\n\n${CCC_REASONING_SAFEGUARDS}\n\nSTAGE-SPECIFIC INSTRUCTIONS:\n${stage === "audit" ? AUDIT_SYSTEM : stage === "reconstruction" ? RECONSTRUCTION_SYSTEM : SYSTEM}` },
              { role: "user", content: stage === "audit"

                  ? `AUDIT ${ref}. FULL VERSE:\n${corpus[ref]}\n\nMORPHOLOGY:\n${grammar}\n\nMORPHOLOGY CHECK SHEET (raw tags may contain errors; reviewed local corrections take precedence):\n${grammarConstraints}\n\nREVIEWED LOCAL CORRECTIONS:\n${localCorrections}\n\nLOCAL CONTEXT:\n${context.join("\n")}\n\nSELECTED VERIFIED PAN-TEXTUAL EVIDENCE:\n${evidence}\n\nCORPUS LEMMA COVERAGE:\n${occurrenceInventory}\n\nRESTORED RESEARCH SECTIONS (arguments, not scripture):\n${researchContext}\n\nNEUTRAL RECONSTRUCTION:\n${JSON.stringify(reconstruction)}\n\nCOMPARATIVE MORPHOLOGY TAGS (verified annotations):\n${morphologyComparisons}\n\nFIVE-SECTION ANALYSIS:\n${prior}\n\nFind only evidence-grounded material errors. Your output is advisory.`
                  : `FOCAL VERSE ${ref} (full Arabic; do not reproduce as a section):\n${corpus[ref]}\n\nMORPHOLOGY (focal only):\n${grammar}\n\nMORPHOLOGY CHECK SHEET (raw tags may contain errors; reviewed local corrections take precedence):\n${grammarConstraints}\n\nREVIEWED LOCAL CORRECTIONS:\n${localCorrections}\n\nLOCAL CONTEXT:\n${context.join("\n")}\n\nPAN-TEXTUAL EVIDENCE SELECTED BEFORE INTERPRETATION (full Arabic):\n${evidence}\n\nCORPUS LEMMA COVERAGE (some references are not full text):\n${occurrenceInventory}\n\nRESTORED RESEARCH SECTIONS (attributed arguments, not Qur'anic authority):\n${researchContext}\n\nCOMPARATIVE MORPHOLOGY TAGS FROM CITED VERSES:\n${morphologyComparisons}\n\n${stage !== "reconstruction" ? `VALIDATED ARGUMENT RECONSTRUCTION (premises to test, not a conclusion to adopt):\n${JSON.stringify(reconstruction)}\n\n` : ""}${stage === "synthesis" ? `COMPLETED GRAMMAR AND CONTEXT (do not repeat):\n${prior}\n` : ""}\n${stageInstructions}\nUse evidence to test interpretations, not decorate a predetermined conclusion.` }
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
            if (stage === "foundation" || stage === "synthesis") emit(controller, "delta", { text: delta }); // Structured reconstruction and audit stay internal until validated.
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
        if (stage === "reconstruction") {
          console.info("Verse argument reconstruction result", {
            ref, model, finishReason, providerDone, durationMs: Date.now() - started,
            promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
            reasoningChunks: reasoningTokensObserved, answerCharacters: answer.length,
            maxOutputTokens: RECONSTRUCTION_OUTPUT_TOKENS,
          });
          if (finishReason === "length") {
            finish("error", {message:`Argument reconstruction exceeded the ${RECONSTRUCTION_OUTPUT_TOKENS}-token output limit (model: ${model}; completion tokens: ${usage?.completion_tokens ?? "unreported"}). No synthesis attempted.`,partial:false});
            return;
          }
          if (!providerDone) {
            finish("error", {message:"Argument reconstruction stream ended without provider completion; no synthesis attempted.",partial:false});
            return;
          }
          const parsed = parseReconstruction(answer,allSupplied);
          if (!parsed) {
            finish("error", {message:"Argument reconstruction JSON invalid or unsupported; no synthesis attempted.",partial:false});
            return;
          }
          emit(controller,"argument",{reconstruction:parsed});
          finish("done",{reference:ref,stage,finishReason,incomplete:false,claims:parsed.claims.length});
          return;
        }
        if (stage === "audit") {
          const parsed = parseStructuredObject(answer) as { findings?: { quote?: string; issue?: string; evidence_kind?: string; evidence_ref?: string; evidence_quote?: string; suggestion?: string }[]; unresolved?: string[] } | null;
          console.info("Verse verification response diagnostics", {ref,model,finishReason,providerDone,
            promptTokens:usage?.prompt_tokens,completionTokens:usage?.completion_tokens,
            answerCharacters:answer.length,maxOutputTokens:AUDIT_OUTPUT_TOKENS,validJson:Boolean(parsed)});
          if (!parsed) {
            finish("error", { message: `Verification could not parse valid JSON (model: ${model}; finish: ${finishReason || "unknown"}; tokens: ${usage?.completion_tokens ?? "unreported"}/${maxTokens}). Analysis retained as UNVERIFIED.`, partial: false }); return;
          }
          if (finishReason === "length" || !providerDone || !Array.isArray(parsed.findings) || !Array.isArray(parsed.unresolved)) {
            finish("error", { message: `Verification incomplete or wrong schema (finish: ${finishReason || "unknown"}; completion: ${providerDone}; tokens: ${usage?.completion_tokens ?? "unreported"}/${maxTokens}). Analysis retained as UNVERIFIED.`, partial: false }); return;
          }
          // Validation requires a verbatim quote in an ACTUAL supplied verse.
          // Never silently replace generated analytical text based on a model's
          // self-certified verdict. Report grounded findings for human review.
          const supplied = new Set([ref, ...context.map(line => line.split(" ")[0]), ...evidenceRefs]);
          const normalize = (v: string) => v.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "");
          const findings = (parsed.findings || []).slice(0,2).filter(item => {
            if (!item.quote || !item.issue || !item.evidence_ref || !item.evidence_quote || !item.suggestion) return false;
            if (!prior.includes(item.quote)) return false;
            const kind = item.evidence_kind || "quran";
            if (kind === "quran") return supplied.has(item.evidence_ref) &&
              normalize(corpus[item.evidence_ref] || "").includes(normalize(item.evidence_quote));
            if (kind === "research") return plan.researchUnits.some(u => u.key === item.evidence_ref &&
              u.text.includes(item.evidence_quote!));
            if (kind === "reconstruction") return item.evidence_ref === "reconstruction" &&
              JSON.stringify(reconstruction).includes(item.evidence_quote);
            return false;
          }).map(item => ({ quote:item.quote!, issue:item.issue!, evidenceRef:item.evidence_ref!, evidenceQuote:item.evidence_quote!, suggestion:item.suggestion! }));
          console.info("Verse analysis verification", { ref, model, durationMs: Date.now()-started,
            proposed: parsed.findings.length, grounded: findings.length, finishReason });
          const deterministic = validateGrammarClaims(prior, [ref, ...contextRefs, ...evidenceRefs], morph, corpus);
          const calibration = validateCalibrationClaims(prior, reconstruction.issue);
          const quality = reviewAnalysisQuality(prior, ref, allSupplied);
          const merged = [...deterministic, ...quality, ...calibration, ...findings].slice(0,8);
          const unresolved = [...parsed.unresolved.filter(x=>typeof x === "string").slice(0,2),
            ...coverageGaps.map(g=>`Central lemma incomplete: ${g}`)].slice(0,8);
          emit(controller, "audit", { findings: merged, unresolved, deterministicFindings: deterministic.length, calibrationFindings: calibration.length,
            modelFindings: findings.length, presentationFindings: quality.length, grammarStatus: deterministic.length ? "token-aligned-flags" : "checked-no-detected-conflict",
            evidenceStatus: coverageGaps.length ? "partial" : "selected-lemmas-covered" });
          finish("done", { reference:ref, stage, finishReason, incomplete:false, durationMs: Date.now()-started,
            findings:merged.length, deterministicFindings:deterministic.length, calibrationFindings:calibration.length, evidenceGaps:coverageGaps.length });
          return;
        }
        validateReferences(answer);
        const outsideEvidence = [...new Set([...answer.matchAll(/\b(\d{1,3}:\d{1,3})\b/g)].map(m=>m[1]))]
          .filter(verseRef=>verifyReference(verseRef,corpus) && !allSupplied.has(verseRef));
        console.info("Verse analysis streamed", {
          ref, model, durationMs: Date.now() - started, finishReason,
          promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
          contentLength: answer.length, morphologyWords: focalMorph.length, evidenceVerses: evidenceRefs.length,
          providerDone, reasoningChunks: reasoningTokensObserved,
        });
        finish("done", {
          reference: ref, stage, finishReason, incomplete: finishReason === "length" || !providerDone || requiredSections.some(n => !sectionCoverage(answer).has(n)),
          completedSections: [...sectionCoverage(answer)].sort(),
          invalidReferences: [...invalid], unsuppliedReferences: outsideEvidence, durationMs: Date.now() - started,
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
  return NextResponse.json({ service: "verse-analysis", status: "ready", version: "7.9.2" });
}
