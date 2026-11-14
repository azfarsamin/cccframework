import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 150; // Requires a Vercel deployment with >=150s function duration.
const UPSTREAM_LIMIT_MS = 132000; // Leave time to flush a final SSE event.
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
  for (let v = Math.max(1, verse - 17); v <= verse + 5; v++) {
    const ref = `${chapter}:${v}`;
    if (corpus[ref]) refs.push(ref);
  }
  const selected = new Set<string>([`${chapter}:${verse}`]);
  // Preserve at least five verses on either side; add older verses within a 13k-char budget.
  for (const ref of refs) {
    const v = Number(ref.split(":")[1]);
    if (Math.abs(v - verse) <= 5) selected.add(ref);
  }
  let total = [...selected].reduce((n, r) => n + corpus[r].length, 0);
  for (const ref of [...refs].reverse()) {
    if (selected.has(ref)) continue;
    const cost = corpus[ref].length;
    if (total + cost > 13000) continue;
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
    .slice(0, 10)
    .map(([candidate]) => `${candidate} ${corpus[candidate]}`);
}

const SYSTEM = `You are a careful analyst of Qurʾānic Arabic examining ONE selected verse. Use the Qurʾān alone as scriptural evidence: no hadith, tafsir, later narrative, inherited geography, or predetermined theology.

EVIDENCE DISCIPLINE (mandatory):
- The supplied numbered morphology records are ground truth for POS, root, verb form, tense/aspect, voice, mood, case and agreement. Read the tags literally. The roman-numeral verb form is supplied only when explicitly tagged (e.g. (III)); an unmarked finite verb is Form I. Never invent or replace a tagged form. For example, an unmarked yaʿdilūn is Form I; yuḍārra with (III) PASS is passive Form III, NOT IV.
- Do not infer rules of law from morphology alone. Identify an imperative as an imperative; describe whether it is legally obligatory or recommended as an interpretation that requires textual evidence.
- Differentiate a ROOT match from a matching WORD/LEMMA and from a semantic analogy. Do not cite a verse as proof of a particular Arabic form unless the supplied data establishes that form.
- Explain the syntactic role of any consequential prepositional phrase, especially those altering the force of a verb.
- Verses supplied as lexical parallels are candidates, not necessarily semantically relevant. Discard weak matches. Do not assert a quotation or the content of an uncited verse from memory. References outside the supplied passages may be mentioned only as optional leads, explicitly marked not checked here.
- Differentiate: (A) exact wording, (B) strong text-supported inference, (C) plausible but unestablished interpretation. Do not manufacture competing readings. When the verse's Arabic is unambiguous, say so.
- Inspect passage-level context before imposing a figurative reading on a lexical item.

Return these six numbered sections IN ORDER:
1. Verse and translation — reliable rendering; don't reproduce the entire Arabic verse when it is long (it is visible in the Reader).
2. Grammar and morphology — focus on 5–12 consequential constructions, fewer for short verses. Give exact corpus-based morphology and discuss syntax.
3. Immediate context — examine the supplied surrounding verses and their argumentative sequence.
4. Related Qurʾānic passages — select 3–7 strong parallels actually supplied, or fewer if warranted; indicate how each matters. Omit irrelevant lexical overlaps.
5. Interpretation — explicit statements, necessary implications, plausible alternatives, and apparent tensions if real.
6. Conclusion — concise synthesis of strongest findings.

Do not mention CCC, or make generic completeness disclaimers. Avoid repetition and do not make an assertion of universal scope when the verse is particular. Aim for 600–1100 words for a complex verse, proportionally less for a short verse.`;

export async function POST(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  const key = process.env.CHUTES_API_KEY;
  if (!passcode) return NextResponse.json({ error: "Analysis passcode not configured." }, { status: 503 });
  if (!secureMatch(req.headers.get("x-ccc-passcode") || "", passcode))
    return NextResponse.json({ error: "Invalid analysis passcode." }, { status: 401 });
  if (!key) return NextResponse.json({ error: "Chutes API key not configured." }, { status: 503 });

  let data: { chapter?: unknown; verse?: unknown };
  try { data = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { chapter, verse } = data;
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
  const context = contextWindow(chapter, verse, corpus);
  const parallels = relatedText(ref, corpus, morph);
  const model = process.env.VERSE_ANALYSIS_MODEL || "deepseek-ai/DeepSeek-V3.2-TEE";
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
      const finish = (event: "done" | "error", payload: Record<string, unknown>) => {
        if (finished) return;
        finished = true;
        try { emit(controller, event, payload); controller.close(); }
        catch { /* Client disconnected. */ }
      };
      try {
        emit(controller, "status", { message: `Preparing analysis for ${ref}…`, reference: ref });
        const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream" },
          signal: abort.signal,
          body: JSON.stringify({
            model, temperature: 0.1, max_tokens: 7000, stream: true,
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: `SELECTED VERSE ${ref}: ${corpus[ref]}\n\nVERIFIED MORPHOLOGY (numbered words in reading order; unmarked verb forms are Form I):\n${grammar}\n\nIMMEDIATE CONTEXT (full verse text):\n${context.join("\n")}\n\nCROSS-REFERENCE CANDIDATES (full verified verse text, ranked by lexical overlap; NOT presumed relevant):\n${parallels.join("\n") || "None"}\n\nProduce the six-section analysis. Treat verb forms and mood tags as verified; check every morphological claim against the numbered records. Do not weaken or strengthen grammatical imperatives without explaining the textual grounds. Only discuss cross-references actually pertinent to the verse.` },
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
          // Deliberately ignore reasoning_content. Display final answer only.
          const delta = choice?.delta?.content;
          if (typeof delta === "string" && delta) {
            answer += delta;
            emit(controller, "delta", { text: delta });
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
          finish("error", { message: "The model finished without final-answer text (possibly consumed by reasoning tokens).", partial: false });
          return;
        }
        validateReferences(answer);
        console.info("Verse analysis streamed", {
          ref, model, durationMs: Date.now() - started, finishReason,
          promptTokens: usage?.prompt_tokens, completionTokens: usage?.completion_tokens,
          contentLength: answer.length, morphologyWords: focalMorph.length, parallelVerses: parallels.length,
          providerDone,
        });
        finish("done", {
          reference: ref, incomplete: finishReason === "length" || !providerDone,
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
    },
  });
}

// A lightweight route check for distinguishing deployment/middleware problems from Chutes failures.
export async function GET() {
  return NextResponse.json({ service: "verse-analysis", status: "ready", version: "7.3" });
}
