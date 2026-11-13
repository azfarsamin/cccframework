import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { retrieveQuranContext, retrieveConceptualContext, type ResearchVerse } from "../../../lib/ccc-corpus";
import { discoverQuranCandidates } from "../../../lib/ccc-conceptual";
import { parseVerifiedThematicList, formatVerifiedThematicList } from "../../../lib/ccc-thematic-list";
import { curatedThemeForQuestion } from "../../../lib/ccc-theme-packs";
import { resolveDeterministicListing, isReferenceOnlyQuestion, isListingQuestion } from "../../../lib/ccc-ai-intents";

export const runtime = "nodejs";
export const maxDuration = 150;

// Model duties are independent. A slow reasoning model should not be used
// to discover and classify references for a Qur'an corpus search.
const DISCOVERY_MODEL = process.env.CCC_DISCOVERY_MODEL || "deepseek-ai/DeepSeek-V3.2-TEE";
const ANALYSIS_MODEL = process.env.CCC_AI_MODEL || "deepseek-ai/DeepSeek-V3.2-TEE";

// Diagnostics are metadata-only: no private prompts, passcodes, API keys, or model reasoning.
const FINAL_TIMEOUT_MS = 65000;
const MAX_FINAL_THEMATIC_VERSES = 18;
const MAX_FINAL_THEMATIC_CHARS = 6800;
const MAX_FINAL_RETRIEVAL_CHARS = 5500;

function elapsed(start: number) { return Date.now() - start; }
function safeError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: "UnknownError", message: "Unknown failure" };
}
function compactThematicEvidence(verses: { reference: string; arabic: string }[]) {
  const selected: string[] = [];
  let chars = 0;
  for (const item of verses) {
    const next = `${item.reference} ${item.arabic}`;
    if (selected.length >= MAX_FINAL_THEMATIC_VERSES || chars + next.length > MAX_FINAL_THEMATIC_CHARS) break;
    selected.push(next);
    chars += next.length;
  }
  return {
    text: selected.join("\n"),
    sent: selected.length,
    omitted: Math.max(0, verses.length - selected.length),
  };
}
function verifiedEvidenceFallback(args: {
  concordance: { term: string; totalOccurrences: number; unit: string; references: { reference: string; count: number }[] } | null;
  candidates: { reference: string; arabic: string }[];
  error: string;
  referencesOnly: boolean;
}) {
  if (args.concordance) {
    const references = args.concordance.references.map(r => r.reference);
    return args.referencesOnly ? references.join(", ") :
      `Final AI analysis was unavailable (${args.error}). The complete, independently indexed lexical concordance is preserved: ${args.concordance.totalOccurrences} ${args.concordance.unit} occurrences of ${args.concordance.term} in ${references.length} verses.\n\n${references.join(", ")}`;
  }
  const refs = [...new Set(args.candidates.map(v => v.reference))];
  if (!refs.length) return `Final AI analysis was unavailable (${args.error}). No verified verse evidence was available to return.`;
  // Corpus verification confirms the verse exists, NOT that it supports the theme.
  const displayed = refs.slice(0, 35);
  const headline = `Final AI analysis was unavailable (${args.error}). These ${displayed.length} Qurʾānic references were verified to exist, but their thematic relevance has NOT been classified or established.`;
  return args.referencesOnly ? `${displayed.join(", ")}\n\nPartial, unclassified candidate references; not a thematic answer.` :
    `${headline}\n\n${displayed.join(", ")}${refs.length > displayed.length ? `\n\n${refs.length - displayed.length} further retrieved candidates omitted.` : ""}`;
}

type InputVerse = { chapter?: number; verse: number; arabic: string };
type Input = { chapter?: number; verses?: InputVerse[]; question?: string };

function equal(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const key = process.env.CHUTES_API_KEY;
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  if (!key || !passcode) {
    return NextResponse.json({ error: "AI is not configured. Check Vercel environment variables." }, { status: 503 });
  }
  if (!equal(request.headers.get("x-ccc-passcode") || "", passcode)) {
    return NextResponse.json({ error: "Invalid research passcode." }, { status: 401 });
  }

  let input: Input;
  try { input = await request.json() as Input; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Array.isArray(input.verses) || input.verses.length > 12 ||
      typeof input.question !== "string" || !input.question.trim() || input.question.length > 3500) {
    return NextResponse.json({ error: "Supply a research question and optionally select up to 12 verses." }, { status: 400 });
  }
  const verses = input.verses.map(v => ({ chapter: v.chapter ?? input.chapter, verse: v.verse, arabic: v.arabic }));
  if (verses.some(v => !Number.isInteger(v.chapter) || (v.chapter ?? 0) < 1 || (v.chapter ?? 0) > 114 ||
      !Number.isInteger(v.verse) || v.verse < 1 || v.verse > 286 ||
      typeof v.arabic !== "string" || !v.arabic.trim() || v.arabic.length > 2500)) {
    return NextResponse.json({ error: "Invalid verse data." }, { status: 400 });
  }
  // Detailed grammar requests require more response space than short CCC summaries.
  // This is a deterministic budget choice, not a guarantee of completion.
  const detailedGrammar = /(?:grammatical|grammar|morpholog(?:y|ical)|syntax|syntactic|i[ʿ']?r[aā]b|na[hḥ]w|صرف|نحو|إعراب|صرفي)/i.test(input.question!);
  const outputTokenBudget = detailedGrammar ? 4000 : 2400;
  const selected = verses as ResearchVerse[];
  const excerpt = selected.map(v => `${v.chapter}:${v.verse} ${v.arabic}`).join("\n");
  const requestStarted = Date.now();
  let stage = "begin";
  try {
    // Resolve explicit listing requests BEFORE broad conceptual discovery and
    // BEFORE any remote corpus fetch or LLM use. This is an index-only route.
    const q = input.question!.trim();
    stage = "deterministic_retrieval";
    const exactStart = Date.now();
    const exact = await resolveDeterministicListing(q);
    console.info("CCC AI stage", { stage, elapsedMs: elapsed(exactStart), hit: Boolean(exact) });
    if (exact) {
      console.log("CCC deterministic listing:", { scope: exact.scope, label: exact.label,
        occurrences: exact.occurrences, references: exact.references.length });
      return NextResponse.json({ answer: exact.answer, incomplete: false,
        finishReason: "deterministic_" + exact.scope + "_listing" });
    }
    stage = "corpus_retrieval";
    const retrievalStart = Date.now();
    const retrieval = await retrieveQuranContext(selected, q);
    console.info("CCC AI stage", { stage, elapsedMs: elapsed(retrievalStart), retrievedCharacters: retrieval.text.length });
    console.log("CCC corpus retrieval:", retrieval.diagnostics);
    const wantsListing = isListingQuestion(q);
    const referencesOnly = isReferenceOnlyQuestion(q);
    const wantsAnalysis = /(?:\banalys(?:is|es|e|ed|ing)\b|\binterpret(?:ation|ations|ed|ing)?\b|\bexplain\b|\bcompare\b|\bmeaning\b|\bwhy\b|\bcoherence\b|\bcorrespondence\b|\bcalibration\b|\bfalsif)/i.test(q);
    // Curated, narrow thematic listing: verify references against the local
    // indexed corpus before returning corpus-owned Arabic. This avoids a
    // 597-verse expansion for questions such as "life is a test". The thematic
    // categories are editorial labels, never an exhaustive semantic claim.
    if (wantsListing && !wantsAnalysis && !retrieval.concordance) {
      const pack = curatedThemeForQuestion(q);
      if (pack) {
        const verified = await retrieveConceptualContext(selected, {
          references: pack.verses.map(v => v.reference), roots: [], queryConcept: pack.title,
        });
        const arabicByReference = new Map(verified.suppliedVerses.map(v => [v.reference, v.arabic]));
        const items = pack.verses.filter(v => arabicByReference.has(v.reference));
        const introduction = `**Research theme: ${pack.title}.** This is a curated Qur'ān-only set of directly relevant verses, not proof that every conceptual parallel has been found. Arabic quotations and references are corpus-verified; the explanatory categories are editorial interpretations.\n\n`;
        return NextResponse.json({
          answer: referencesOnly
            ? items.map(v => v.reference).sort((a,b) => { const [as,av]=a.split(":").map(Number),[bs,bv]=b.split(":").map(Number);return as-bs || av-bv; }).join(", ")
            : introduction + formatVerifiedThematicList(items, arabicByReference, items.length, false, "Life and worldly circumstances as a test"),
          incomplete: false,
          finishReason: "verified_curated_thematic_list",
        });
      }
    }

    // Natural-language thematic questions need a discovery -> local verification
    // pass. Never trigger it for methodology-only questions, or where a
    // deterministic lemma concordance already answers the question.
    const methodologyOnly = /(?:chapter\s*1|ccc methodology|agrippa|epistemolog|methodological principle)/i.test(q)
      && !/(?:qur.?an|quranic|verses?|surah|\b2:\d+\b)/i.test(q);
    const thematic = !retrieval.concordance && !methodologyOnly &&
      /(?:qur.?an|quranic|verses?|surah|god|allah|life|world|creation|test|trial|scripture)/i.test(q);
    let thematicEvidence = "";
    let thematicListing = false;
    let verifiedThematic: Awaited<ReturnType<typeof retrieveConceptualContext>> | null = null;
    if (thematic) {
      try {
        stage = "thematic_discovery";
        const discoveryStart = Date.now();
        const proposed = await discoverQuranCandidates(q, selected, key, DISCOVERY_MODEL);
        console.info("CCC AI stage", { stage, elapsedMs: elapsed(discoveryStart), references: proposed.references.length, roots: proposed.roots.length });
        stage = "thematic_verification";
        const verificationStart = Date.now();
        const verified = await retrieveConceptualContext(selected, proposed);
        console.info("CCC AI stage", { stage, elapsedMs: elapsed(verificationStart), candidates: verified.suppliedVerses.length });
        thematicEvidence = verified.text;
        verifiedThematic = verified;
        thematicListing = wantsListing && !wantsAnalysis;
        console.log("CCC thematic retrieval:", verified.diagnostics);
      } catch (error) {
        console.error("CCC thematic discovery failed:", error);
        return NextResponse.json({ error: "Thematic retrieval failed; no verified thematic answer was generated. Please retry." }, { status: 502 });
      }
    }
    if (wantsListing && !wantsAnalysis && retrieval.concordance) {
      const c = retrieval.concordance;
      const verses = retrieval.concordanceVerses;
      if (referencesOnly) return NextResponse.json({
        answer: c.references.map(r => r.reference).join(", "), incomplete: false,
        finishReason: "verified_concordance_references_only",
      });
      const lines = [
        `## Verified Qurʾānic lexical concordance — ${c.term}`,
        `**${c.totalOccurrences} ${c.unit} occurrences across ${c.references.length} numbered verses.**`,
        "",
      ];
      if (verses.length === c.references.length) {
        for (const v of verses) lines.push(`### ${v.reference} — ${v.count} occurrence${v.count === 1 ? "" : "s"}`, v.arabic, "");
      } else {
        for (const r of c.references) lines.push(`- ${r.reference}: ${r.count} occurrence${r.count === 1 ? "" : "s"}`);
        lines.push("", "The full reference list is complete; Arabic verse quotations are omitted because the result is too large for this response.");
      }
      lines.push("**Scope:** Exhaustive matching of the identified morphological lemma in the locally indexed Qurʾānic corpus; not a complete conceptual/semantic search. Morphological annotations are a linguistic analysis layer.");
      return NextResponse.json({ answer: lines.join("\n"), incomplete: false, finishReason: "verified_concordance" });
    }

    // For listing-only thematic requests, the model returns classifications
    // as JSON. The server checks every reference against the exact candidate
    // verses that were actually supplied, deduplicates it, and renders only
    // corpus-owned Arabic. This prevents phantom citations, missing-list claims,
    // and invented Arabic quotations in the final output.
    if (thematicListing && verifiedThematic) {
      const verified = verifiedThematic;
      const candidates = verified.suppliedVerses;
      if (!candidates.length) {
        return NextResponse.json({ answer: "No valid Qurʾānic candidate verses were retrieved. Thematic coverage could not be assessed.", incomplete: false, finishReason: "no_thematic_candidates" });
      }
      // Prefer the direct candidate references proposed by the discovery model;
      // root-expanded references follow them. Classify only as much evidence as
      // the runtime can safely examine. Never represent bounded evidence as an
      // exhaustive thematic search, and never fail solely on candidate count.
      const MAX_BATCHES = 8;
      const batches: typeof candidates[] = [];
      let batch: typeof candidates = [];
      let chars = 0;
      let classifiedCount = 0;
      for (const candidate of candidates) {
        const size = candidate.reference.length + candidate.arabic.length + 2;
        if (batch.length && (batch.length >= 7 || chars + size > 3600)) {
          batches.push(batch);
          batch = [];
          chars = 0;
        }
        if (batches.length >= MAX_BATCHES) break;
        batch.push(candidate);
        chars += size;
        classifiedCount++;
      }
      if (batch.length && batches.length < MAX_BATCHES) batches.push(batch);
      const bounded = classifiedCount < candidates.length;
      console.log("CCC thematic bounded classification:", {
        totalCandidates: candidates.length, classifiedCount, bounded, batches: batches.length,
      });
      const model = DISCOVERY_MODEL; // small JSON-only thematic classification batches
      const classifyBatch = async (items: typeof candidates, index: number) => {
        const allowed = new Set(items.map(v => v.reference));
        const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(45000),
          body: JSON.stringify({
            model,
            temperature: 0.1,
            max_tokens: 2000,
            messages: [
              { role: "system", content: `Classify Qur'anic passages for the user's thematic list based on their relevance to the question. Return EXACTLY ONE JSON object: {"verses":[{"reference":"67:2","category":"general","explanation":"Death and life were created to test deeds."}]}. Categories: general = broad statements about the purpose or nature of earthly testing; situational = a particular type of trial; historical = a specific past event or reported speech. For other research topics, apply the same general/situational/historical distinction sensibly. Judge EACH supplied verse independently; omit those not relevant to the question. For each relevant verse give a concise (maximum 22-word) explanation. Use ONLY references in the supplied batch. Do not invent quotations, references or assertions of exhaustiveness. No Markdown or prose outside JSON.` },
              { role: "user", content: `Research question: ${q}\nBatch ${index + 1} of ${batches.length} — classify only the verses below:\n${items.map(v => `${v.reference} ${v.arabic}`).join("\n")}` },
            ],
          }),
        });
        if (!response.ok) throw new Error(`Thematic batch ${index + 1} HTTP ${response.status}`);
        const json = await response.json();
        const choice = json?.choices?.[0];
        if (choice?.finish_reason === "length") throw new Error(`Thematic batch ${index + 1} reached the output-token limit`);
        const raw = choice?.message?.content;
        if (typeof raw !== "string" || !raw.trim()) throw new Error(`Empty thematic batch ${index + 1}`);
        return parseVerifiedThematicList(raw, allowed);
      };
      // Use bounded concurrency: requests are independent but Vercel has a
      // finite execution window. Any failed batch fails the WHOLE listing.
      const allResults: Awaited<ReturnType<typeof classifyBatch>>[] = [];
      let failedBatches = 0;
      stage = "thematic_classification";
      const classificationStart = Date.now();
      for (let i = 0; i < batches.length; i += 4) {
        const wave = await Promise.all(batches.slice(i, i + 4).map(async (items, offset) => {
          try { return await classifyBatch(items, i + offset); }
          catch (error) { console.error("CCC thematic batch failed:", error); failedBatches++; return []; }
        }));
        allResults.push(...wave);
      }
      console.info("CCC AI stage", { stage, elapsedMs: elapsed(classificationStart), batches: batches.length, failedBatches });
      const merged = new Map<string, (typeof allResults)[number][number]>();
      for (const item of allResults.flat()) if (!merged.has(item.reference)) merged.set(item.reference, item);
      const rank = { general: 0, situational: 1, historical: 2 };
      const items = [...merged.values()].sort((a, b) =>
        rank[a.category] - rank[b.category] ||
        Number(a.reference.split(":")[0]) - Number(b.reference.split(":")[0]) ||
        Number(a.reference.split(":")[1]) - Number(b.reference.split(":")[1]));
      const arabicByReference = new Map(candidates.map(v => [v.reference, v.arabic]));
      console.log("CCC thematic batch coverage:", {
        verifiedCandidates: candidates.length,
        batchCount: batches.length,
        classifiedCandidates: classifiedCount,
        relevantUnique: items.length,
        excerptTruncated: verified.diagnostics.truncated,
      });
      return NextResponse.json({
        answer: referencesOnly
          ? items.map(v => v.reference).sort((a,b) => { const [as,av]=a.split(":").map(Number),[bs,bv]=b.split(":").map(Number);return as-bs || av-bv; }).join(", ")
          : ((bounded || failedBatches)
            ? `**Coverage limit:** Up to ${classifiedCount} of ${candidates.length} verified candidate verses were considered; ${failedBatches} batches failed. This is a partial thematic result.\n\n`
            : "") + formatVerifiedThematicList(items, arabicByReference, candidates.length, bounded || !!failedBatches, q),
        incomplete: bounded || failedBatches > 0,
        finishReason: failedBatches ? "verified_thematic_list_partial_batches" : "verified_thematic_list_batched",
      });
    }

    const thematicInstruction = thematicListing
      ? "THE USER REQUESTED A THEMATIC LIST, NOT AN ESSAY. Examine all supplied candidate Arabic verses. Return only directly relevant verified references with a brief faithful explanation of each. Do not impose categories from a different research theme; exclude unrelated root matches. Do not add unrelated commentary. Do not claim the thematic list is exhaustive."
      : thematicEvidence
        ? "Evaluate the retrieved thematic candidates; exclude irrelevant root matches. Do not claim the conceptual search is exhaustive. Include conceptual parallels beyond exact lexical matches."
        : "";
    // Pass a bounded, verified evidence excerpt to the expensive final model;
    // NEVER silently interpret a truncated candidate excerpt as complete coverage.
    const focused = verifiedThematic ? compactThematicEvidence(verifiedThematic.suppliedVerses) : null;
    const evidence = focused
      ? `VERIFIED CANDIDATE PASSAGES (${focused.sent} supplied; ${focused.omitted} not included):\n${focused.text}\n\nThese are candidates, not confirmed thematic matches. Do not assert exhaustiveness.`
      : retrieval.text.slice(0, MAX_FINAL_RETRIEVAL_CHARS);
    const scopedSelected = excerpt.slice(0, 2200);
    const analysisUserContent = `Optional user-selected Qur'anic starting verses:\n${scopedSelected || "None selected."}\n\nSERVER-RETRIEVED CORPUS EVIDENCE:\n${evidence}\n\nResearch question: ${q}`;
    const analysisSystemContent = `You are a Qur'an research assistant. Answer the question directly and reason from the supplied Qur'anic evidence. Distinguish explicit wording from interpretation. No hadith or tafsir. Never invent verses or Arabic quotations. If evidence was truncated, do not claim conceptual completeness. Do not add irrelevant headings. If analysis cannot be completed from supplied verses, state the limitation succinctly. ${thematicInstruction} ${referencesOnly ? "Return only references for verified relevant verses when possible; never describe an unclassified candidate list as exhaustive." : ""}`;
    const finalBudget = Math.min(outputTokenBudget, 2200);
    const finalStart = Date.now();
    stage = "final_analysis";
    console.info("CCC final analysis request", {
      model: ANALYSIS_MODEL, systemCharacters: analysisSystemContent.length,
      userCharacters: analysisUserContent.length, finalBudget,
      thematicCandidates: verifiedThematic?.suppliedVerses.length ?? 0,
      thematicSent: focused?.sent ?? 0, thematicOmitted: focused?.omitted ?? 0,
    });
    let response: Response;
    try {
      response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: ANALYSIS_MODEL,
          temperature: 0.3,
          max_tokens: finalBudget,
          messages: [
            { role: "system", content: analysisSystemContent },
            { role: "user", content: analysisUserContent },
          ],
        }),
        signal: AbortSignal.timeout(FINAL_TIMEOUT_MS),
      });
    } catch (error) {
      console.error("CCC final analysis transport failure", { stage, ...safeError(error), elapsedMs: elapsed(finalStart), totalMs: elapsed(requestStarted) });
      return NextResponse.json({
        answer: verifiedEvidenceFallback({
          concordance: retrieval.concordance,
          candidates: verifiedThematic?.suppliedVerses ?? [],
          referencesOnly,
          error: error instanceof Error && /timeout|abort/i.test(error.name + " " + error.message) ? "model request timed out" : "model request failed",
        }),
        incomplete: true, finishReason: "final_model_transport_fallback",
      });
    }
    let json: {
      model?: string;
      error?: { code?: string; type?: string };
      choices?: Array<{
        finish_reason?: string | null;
        message?: { content?: string | null; reasoning_content?: string | null };
      }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try { json = await response.json(); }
    catch (error) {
      console.error("CCC final analysis invalid response", { stage, ...safeError(error), elapsedMs: elapsed(finalStart) });
      return NextResponse.json({ answer: verifiedEvidenceFallback({
        concordance: retrieval.concordance, candidates: verifiedThematic?.suppliedVerses ?? [],
        referencesOnly, error: "invalid upstream JSON",
      }), incomplete: true, finishReason: "final_model_invalid_response_fallback" });
    }
    if (!response.ok) {
      console.error("Chutes request failed", { status: response.status, errorCode: json?.error?.code, errorType: json?.error?.type });
      return NextResponse.json({ answer: verifiedEvidenceFallback({
        concordance: retrieval.concordance, candidates: verifiedThematic?.suppliedVerses ?? [],
        referencesOnly, error: `upstream HTTP ${response.status}`,
      }), incomplete: true, finishReason: "final_model_http_fallback" });
    }
    const choice = json?.choices?.[0];
    const answer = choice?.message?.content;
    console.log("Chutes diagnostic:", {
      model: json?.model,
      finishReason: choice?.finish_reason,
      outputTokenBudget,
      contentLength: typeof answer === "string" ? answer.length : 0,
      reasoningLength: choice?.message?.reasoning_content?.length ?? 0,
      usage: json?.usage,
    });
    if (typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json({ answer: verifiedEvidenceFallback({
        concordance: retrieval.concordance, candidates: verifiedThematic?.suppliedVerses ?? [],
        referencesOnly, error: `no final content (finish_reason=${choice?.finish_reason ?? "unknown"})`,
      }), incomplete: true, finishReason: "final_model_empty_fallback" });
    }
    console.info("CCC AI stage", { stage, elapsedMs: elapsed(finalStart), totalMs: elapsed(requestStarted),
      finishReason: choice?.finish_reason, outputCharacters: typeof answer === "string" ? answer.length : 0 });
    const incomplete = choice?.finish_reason === "length" || Boolean(focused?.omitted);
    // Lexical concordances come from the corpus index, not the model's recollection.
    // Show them deterministically even if the model fails to enumerate all references.
    const verifiedConcordance = retrieval.concordance
      ? `Verified Qurʾānic morphology concordance — ${retrieval.concordance.term}: ${retrieval.concordance.totalOccurrences} ${retrieval.concordance.unit} occurrences in ${retrieval.concordance.references.length} verses.\n${retrieval.concordance.references.map(r => `${r.reference} (${r.count})`).join(", ")}\n\n---\n\n`
      : "";
    const thematicNotice = thematicEvidence
      ? "**Thematic retrieval:** Candidate verses were checked against the Qurʾānic corpus, but conceptual completeness cannot be guaranteed.\n\n"
      : "";
    return NextResponse.json({ answer: thematicNotice + verifiedConcordance + answer, incomplete, finishReason: choice?.finish_reason ?? null });
  } catch (error) {
    console.error("CCC AI request failed:", { stage, ...safeError(error), totalMs: elapsed(requestStarted) });
    return NextResponse.json({ error: "AI research request failed. Check Vercel logs for file or corpus retrieval errors." }, { status: 502 });
  }
}
