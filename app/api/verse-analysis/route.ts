import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 150; // Requires a Vercel deployment with >=150s function duration.
// Fail before the platform's 150-second limit, preserving any streamed text.
// A shorter response and leaner evidence payload should normally finish well before this.
const UPSTREAM_LIMIT_MS = 132000;
const MAX_OUTPUT_TOKENS = 4200; // Budget for each of the two streamed writing stages.
const AUDIT_OUTPUT_TOKENS = 1500; // Short, targeted proofing pass; never rewrites the full answer.
const HEARTBEAT_MS = 12000;

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
function relatedText(ref: string, corpus: Corpus, morph: Morphology): string[] {
  const words = morph[ref] || [];
  const { roots, frequencies } = buildReverse(morph);
  const focal = new Set(words.map(w => w.r).filter((r): r is string => Boolean(r)));
  const scores = new Map<string, number>();
  for (const root of focal) {
    const frequency = frequencies.get(root) || 1;
    // Extremely common roots tend to produce irrelevant connections.
    if (frequency > 900) continue;
    const weight = Math.log(1 + 6236 / frequency);
    for (const candidate of roots.get(root) || []) {
      if (candidate === ref || !corpus[candidate]) continue;
      const [a, b] = candidate.split(":").map(Number);
      const [chapter, verse] = ref.split(":").map(Number);
      if (a === chapter && Math.abs(b - verse) <= 17) continue;
      scores.set(candidate, (scores.get(candidate) || 0) + weight);
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || Number(a[0].split(":")[0]) - Number(b[0].split(":")[0]))
    .slice(0, 6)
    .map(([candidate]) => `${candidate} ${corpus[candidate]}`);
}

const AUDIT_SYSTEM = `You are a strict Qurʾān-only proofreader. Audit the six-section answer against the primary Arabic verse, supplied morphology, context and related Arabic passages. Do not introduce hadith, tafsir, inherited geography, or outside claims.
Check specifically: (1) correct protasis/apodosis for EVERY conditional, (2) visible mood vs corpus annotations without invented discrepancies, including estimated case endings, (3) lām of command versus prohibitive lā, (4) inaccurate claims of exact quotation, (5) claims contradicted by relevant Qurʾānic wording, (6) unsupported historical, legal or grammatical conclusions, (7) omissions of an operative clause where central to the interpretation.
Do not manufacture disputes or revise defensible wording merely for style. The first Arabic text is the source of truth. Never revise Arabic source text, headings or quotations of the verse itself.
Output ONLY a valid JSON object (no Markdown fences) with this shape: {"edits":[{"old":"exact unique text fragment copied from the provided analysis","new":"replacement text","reason":"one-line evidence grounded in supplied text"}],"unresolved":["material question not resolved by supplied evidence"]}.
Maximum 5 edits and 3 unresolved. Each old fragment must be unique in the analysis, no longer than 500 characters; each replacement must be no longer than 650 characters. If no material mistakes, output {"edits":[],"unresolved":[]}. Avoid making an edit unless the correction is well supported.`;

const SYSTEM = `Analyze ONE Qurʾānic verse from the supplied Arabic text, morphology and passages. Qurʾān-only: no hadith, tafsir, inherited historical narratives, presumed geography or theological assumptions.

EVIDENCE AND GRAMMAR RULES:
- Preserve the difference between (A) explicit Arabic wording, (B) necessary/strong text-supported inference, and (C) merely possible interpretation. Conclusions must NEVER promote B or C to A, or C to B.
- Morphology annotations are evidence, NOT infallible. Cite word number and exact tag where useful; if a tag appears inconsistent with the visible Arabic or syntax, flag the discrepancy, show both, and do not silently repair or invent a tag. Distinguish inflectional mood, verbal subject agreement, attached object suffixes, and nominal possessive suffixes.
- A conditional protasis is the condition; the apodosis is the consequent. Do not label the conditional verb itself as the apodosis.
- Do not infer semantic force, legal consequences, permanence, particularity, forgiveness or eschatology from verb patterns, tense, indefinite nouns or syntax alone.
- Compare Qurʾānic passages semantically; a shared ROOT is not necessarily a shared LEMMA or meaning. Cross-reference candidates are leads, not evidence by themselves. Drop weak matches. Cite only supplied passages; do not invent words in a citation.
- When the text is clear, do not invent competing readings, fake tensions or obligatory uncertainty. When it is not decisive, state exactly what remains unestablished.
- Use Unicode Arabic (or simple, clean transliteration). Never emit HTML entities (&#...;), Buckwalter strings, broken Markdown escapes or raw corpus notation in the prose.

OUTPUT CONTRACT: Write ONLY the headings specified by the user message, each on its own line, and complete every required heading. Use short paragraphs and '-' bullets, NEVER a second numbered list under headings. In Grammar focus on 3–7 decisive constructions; in Related passages use at most 4 compelling parallels; in Interpretation separate explicit wording from inference. No meta preamble. No duplicate heading. Do not mention CCC.`;

export async function POST(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  const key = process.env.CHUTES_API_KEY;
  if (!passcode) return NextResponse.json({ error: "Analysis passcode not configured." }, { status: 503 });
  if (!secureMatch(req.headers.get("x-ccc-passcode") || "", passcode))
    return NextResponse.json({ error: "Invalid analysis passcode." }, { status: 401 });
  if (!key) return NextResponse.json({ error: "Chutes API key not configured." }, { status: 503 });

  let data: { chapter?: unknown; verse?: unknown; stage?: unknown; prior?: unknown };
  try { data = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { chapter, verse } = data;
  const stage = data.stage === "audit" ? "audit" : data.stage === "synthesis" ? "synthesis" : data.stage === "foundation" ? "foundation" : null;
  if (!stage) return NextResponse.json({ error: "Invalid analysis stage. Update both v7.6 files." }, { status: 400 });
  const prior = typeof data.prior === "string" ? data.prior.slice(0, 30000) : "";
  if (stage === "synthesis" && !prior.includes("## 3. Immediate context"))
    return NextResponse.json({ error: "Foundation analysis is missing. Cannot synthesize an incomplete analysis." }, { status: 400 });
  if (stage === "audit" && ![1, 2, 3, 4, 5, 6].every(n => prior.includes(`## ${n}.`)))
    return NextResponse.json({ error: "Audit requires all six sections. Preserve the existing analysis and retry." }, { status: 400 });
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
  const requiredSections = stage === "audit" ? [] : stage === "foundation" ? [1, 2, 3] : [4, 5, 6];
  const stageInstructions = stage === "foundation"
    ? `Write ONLY these three sections with these EXACT headings:\n## 1. Verse and translation\n## 2. Grammar and morphology\n## 3. Immediate context\nProvide a faithful concise translation, 3–7 consequential grammatical observations, and immediate context. Limit to roughly 250–400 words excluding the Arabic verse. Finish section 3 completely. Do not start section 4.`
    : `Write ONLY these three sections with these EXACT headings:\n## 4. Related Qurʾānic passages\n## 5. Interpretation\n## 6. Conclusion\nFirst verify relevant pan-textual references; in interpretation distinguish explicit statements, necessary inferences, and possibilities. Keep the conclusion aligned with the evidence and avoid restating the earlier sections. Limit to roughly 250–400 words. Finish section 6 completely.`;
  const context = contextWindow(chapter, verse, corpus);
  const parallels = relatedText(ref, corpus, morph);
  // A single default model drives all stages, with independent overrides available.
  // This route does not control unrelated CCC discovery routes elsewhere in the repository.
  const baseModel = process.env.VERSE_ANALYSIS_MODEL || "zai-org/GLM-5.2-Fast";
  const model = (stage === "foundation" ? process.env.VERSE_ANALYSIS_FOUNDATION_MODEL
    : stage === "synthesis" ? process.env.VERSE_ANALYSIS_SYNTHESIS_MODEL
    : process.env.VERSE_ANALYSIS_AUDIT_MODEL) || baseModel;
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
        emit(controller, "status", { message: `${stage === "foundation" ? "Analyzing wording, grammar and context" : stage === "synthesis" ? "Analyzing Qurʾānic parallels and interpretation" : "Verifying grammatical accuracy and Qurʾānic coherence"} for ${ref}…`, reference: ref, stage });
        const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: abort.signal,
          body: JSON.stringify({
            model, temperature: 0.1, max_tokens: stage === "audit" ? AUDIT_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS, stream: true,
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
                ? `AUDIT THIS ANALYSIS OF ${ref}.\n\nPRIMARY ARABIC VERSE:\n${corpus[ref]}\n\nMORPHOLOGY:\n${grammar}\n\nIMMEDIATE CONTEXT:\n${context.join("\n")}\n\nCROSS-REFERENCE CANDIDATES (only leads):\n${parallels.join("\n")}\n\nCOMPLETE SIX-SECTION ANALYSIS:\n${prior}\n\nFind only material, verifiable errors; keep any uncertain issue in unresolved, not as an edit.`
                : `SELECTED VERSE ${ref}: ${corpus[ref]}\n\nCORPUS MORPHOLOGY (numbered words in reading order; tags may be questioned on explicit grammatical grounds):\n${grammar}\n\nIMMEDIATE CONTEXT (full verse text):\n${context.join("\n")}\n\nCROSS-REFERENCE CANDIDATES (full verified verse text, ranked by lexical overlap; NOT presumed relevant):\n${parallels.join("\n") || "None"}\n\n${stage === "synthesis" ? `\nPREVIOUSLY COMPLETED FOUNDATION (do not repeat; ensure consistency):\n${prior}\n` : ""}\n${stageInstructions}\nCheck tags against visible forms. Use the supplied passages as leads, not automatic confirmations.` },
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
            if (stage !== "audit") emit(controller, "delta", { text: delta }); // Audit JSON is internal until validated.
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
          // A verifier's assertion is not a verified fact: apply only exact, unique,
          // short replacements; do not permit changes to headings or Arabic source text.
          let parsed: { edits?: { old?: string; new?: string; reason?: string }[]; unresolved?: string[] };
          try {
            const clean = answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
            parsed = JSON.parse(clean);
          } catch {
            finish("error", { message: `Audit returned invalid JSON (finish: ${finishReason || "unknown"}). Original analysis retained; not independently verified.`, partial: false });
            return;
          }
          if (finishReason === "length" || !providerDone || !Array.isArray(parsed.edits) || !Array.isArray(parsed.unresolved) || parsed.edits.length > 5 || parsed.unresolved.length > 3) {
            finish("error", { message: "Audit was truncated or did not follow its structured output contract. Original analysis retained.", partial: false });
            return;
          }
          let revised = prior;
          const accepted: { old: string; new: string; reason: string }[] = [];
          const rejected: string[] = [];
          for (const item of parsed.edits) {
            if (typeof item.old !== "string" || typeof item.new !== "string" || typeof item.reason !== "string" ||
                item.old.length < 12 || item.old.length > 500 || item.new.length > 650 ||
                item.old.includes("## ") || item.new.includes("## ") ||
                revised.split(item.old).length !== 2 || revised.indexOf(item.old) < revised.indexOf("## 2. Grammar and morphology")) { rejected.push(item.reason || "Non-unique or unsupported correction"); continue; }
            // The corpus must contain every reference inserted by the proposed correction.
            const badRef = [...item.new.matchAll(/\b(\d{1,3}):(\d{1,3})\b/g)].some(m => !verifyReference(`${m[1]}:${m[2]}`, corpus));
            if (badRef) { rejected.push(item.reason); continue; }
            revised = revised.replace(item.old, item.new);
            accepted.push({ old: item.old, new: item.new, reason: item.reason.slice(0, 400) });
          }
          console.info("Verse analysis audit", { ref, model, durationMs: Date.now() - started, accepted: accepted.length, rejected: rejected.length, unresolved: parsed.unresolved.length, finishReason });
          emit(controller, "audit", { correctedText: revised, corrections: accepted, rejected: rejected.slice(0, 3), unresolved: parsed.unresolved.filter(x => typeof x === "string").slice(0, 3) });
          finish("done", { reference: ref, stage, finishReason, incomplete: false, durationMs: Date.now() - started, corrected: accepted.length, unresolved: parsed.unresolved.length });
          return;
        }
        validateReferences(answer);
        console.info("Verse analysis streamed", {
          ref, model, durationMs: Date.now() - started, finishReason,
          promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
          contentLength: answer.length, morphologyWords: focalMorph.length, parallelVerses: parallels.length,
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
  return NextResponse.json({ service: "verse-analysis", status: "ready", version: "7.6" });
}
