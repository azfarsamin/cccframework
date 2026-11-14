import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 150;

type MorphSegment = [string, string, string];
type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
type Corpus = Record<string, string>;
let quranCache: Corpus | null = null;
let morphologyCache: Record<string, MorphWord[]> | null = null;

async function quran(): Promise<Corpus> {
  if (!quranCache) {
    const raw = await readFile(path.join(process.cwd(), "public/data/ccc-quran-arabic.json"), "utf8");
    const parsed = JSON.parse(raw) as Corpus;
    if (Object.keys(parsed).length !== 6236 || !parsed["1:1"] || !parsed["114:6"])
      throw new Error("Local Qurʾān text is missing or incomplete.");
    quranCache = parsed;
  }
  return quranCache;
}
async function morphology(): Promise<Record<string, MorphWord[]> | null> {
  if (morphologyCache) return morphologyCache;
  try {
    const raw = await readFile(path.join(process.cwd(), "public/data/morphology.json"), "utf8");
    morphologyCache = JSON.parse(raw) as Record<string, MorphWord[]>;
    return morphologyCache;
  } catch { return null; }
}
function secureMatch(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function parseReference(reference: string, corpus: Corpus) {
  const [chapter, verse] = reference.split(":").map(Number);
  return Number.isInteger(chapter) && Number.isInteger(verse) && Boolean(corpus[reference]);
}

const SYSTEM = `You are an expert analyst of the Qurʾānic Arabic text. Examine ONE selected verse thoroughly, not an arbitrary user question.
Use only the Qurʾān as scriptural evidence. Do not appeal to hadith, classical tafsir, later biographies, traditional geography, or an assumed chronology. Do not use a prior theological conclusion as evidence.
Produce a substantive yet concise English report with these headings:
1. Verse and translation — present the reference and faithful rendering, avoiding invented Arabic.
2. Grammar and morphology — analyze consequential words, roots, verb forms, case, syntax, pronoun referents, particles, and ambiguities. Use supplied morphological annotations where available, and distinguish facts from proposed parses. Do not attempt an exhaustive glossary if it does not affect interpretation.
3. Immediate context — analyze the preceding and following verses actually supplied, identifying passage boundaries and relevant antecedents.
4. Related Qurʾānic passages — select the strongest substantive parallels, qualifications, and possible tensions, explaining relevance rather than listing verses. Cite exact references; do not invent verse text. If a parallel is uncertain, omit it.
5. Interpretation — distinguish explicit wording from inferences and reasonable alternative readings; explain implications and remaining textual questions.
6. Conclusion — a compact synthesis.
Do NOT include a CCC framework, coherence/correspondence/calibration score, research question, or a generic disclaimer. Do not claim exhaustive conceptual coverage. Prioritize accurate analysis and avoid repetition. Your report should be detailed but fit within the output budget.`;

export async function POST(req: NextRequest) {
  const passcode = process.env.CCC_RESEARCH_PASSCODE;
  const apiKey = process.env.CHUTES_API_KEY;
  if (!passcode) return NextResponse.json({ error: "Private analysis passcode is not configured." }, { status: 503 });
  if (!secureMatch(req.headers.get("x-ccc-passcode") || "", passcode))
    return NextResponse.json({ error: "Invalid analysis passcode." }, { status: 401 });
  if (!apiKey) return NextResponse.json({ error: "Chutes API key is not configured." }, { status: 503 });
  let data: { chapter?: unknown; verse?: unknown };
  try { data = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const chapter = data.chapter, verse = data.verse;
  if (typeof chapter !== "number" || typeof verse !== "number" ||
      !Number.isInteger(chapter) || !Number.isInteger(verse) ||
      chapter < 1 || chapter > 114 || verse < 1)
    return NextResponse.json({ error: "Select a valid Qurʾānic verse." }, { status: 400 });
  const ref = `${chapter}:${verse}`;
  let corpus: Corpus;
  try { corpus = await quran(); }
  catch (error) {
    console.error("Verse analysis corpus error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Local Qurʾān corpus unavailable." }, { status: 503 });
  }
  if (!corpus[ref]) return NextResponse.json({ error: `Verse ${ref} is not in the Qurʾānic corpus.` }, { status: 400 });

  // Always include the focal verse. Context is restricted to the same surah.
  // The model is told which references were actually supplied.
  const context: string[] = [];
  for (let index = Math.max(1, (verse as number) - 17); index <= (verse as number) + 5; index++) {
    const key = `${chapter}:${index}`;
    if (corpus[key]) context.push(`${key} ${corpus[key]}`);
  }
  const annotations = (await morphology())?.[ref] || [];
  const grammar = annotations.map((word, index) => {
    const seg = word.s.map(part => `${part[0]}:${part[1]} (${part[2]})`).join(" + ");
    return `${index + 1}. lemma=${word.l || "—"}; root=${word.r || "—"}; ${seg}`;
  }).join("\n").slice(0, 9000);

  const model = process.env.VERSE_ANALYSIS_MODEL || "deepseek-ai/DeepSeek-V3.2-TEE";
  const started = Date.now();
  try {
    const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(105000),
      body: JSON.stringify({
        model, temperature: 0.15, max_tokens: 4800,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `Selected verse: ${ref}\nArabic: ${corpus[ref]}\n\nImmediate context (same surah):\n${context.join("\n")}\n\nMorphological annotations (Buckwalter transliteration and corpus tags; these can contain annotation uncertainties):\n${grammar || "Not available"}\n\nAnalyze the selected verse. For related verses outside this local passage, cite references only if reasonably confident of their content.` },
        ],
      }),
    });
    if (!response.ok) {
      console.error("Verse analysis model HTTP", response.status, { durationMs: Date.now() - started });
      return NextResponse.json({ error: `Analysis model unavailable (HTTP ${response.status}).` }, { status: 502 });
    }
    const result = await response.json() as {
      choices?: { finish_reason?: string; message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const answer = result.choices?.[0]?.message?.content?.trim() || "";
    const incomplete = result.choices?.[0]?.finish_reason === "length";
    console.info("Verse analysis completion", {
      ref, model, durationMs: Date.now() - started, finishReason: result.choices?.[0]?.finish_reason,
      promptTokens: result.usage?.prompt_tokens, completionTokens: result.usage?.completion_tokens,
      answerLength: answer.length,
    });
    if (!answer) return NextResponse.json({ error: "The model returned no analysis. Please retry." }, { status: 502 });
    // This validates cited reference existence, not every interpretive claim.
    const possibleRefs = [...answer.matchAll(/\b(\d{1,3}):(\d{1,3})(?:\s*[–-]\s*(\d{1,3}))?\b/g)];
    const invalidRefs = [...new Set(possibleRefs.filter(match => {
      const first = `${match[1]}:${match[2]}`;
      if (!parseReference(first, corpus)) return true;
      if (!match[3]) return false;
      const end = Number(match[3]);
      return end < Number(match[2]) || end - Number(match[2]) > 100 || !parseReference(`${match[1]}:${end}`, corpus);
    }).map(match => match[0]))];
    const warning = invalidRefs.length ? `\n\n**Reference verification notice:** The model cited unverified or invalid references: ${invalidRefs.join(", ")}. Check these before relying on them.` : "";
    return NextResponse.json({ answer: answer + warning, incomplete, reference: ref });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("Verse analysis model failure", { ref, model, name, durationMs: Date.now() - started });
    return NextResponse.json({ error: name === "TimeoutError" ? "The analysis model timed out. Please retry." : "Unable to complete analysis." }, { status: 504 });
  }
}
