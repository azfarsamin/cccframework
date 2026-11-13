/**
 * Model-assisted candidate discovery. This module NEVER declares a thematic
 * search exhaustive: candidate terms and references are hypotheses until
 * checked against the local morphology index and the Arabic text.
 */
export type ConceptCandidates = {
  references: string[];
  roots: string[];
  queryConcept: string;
};

function parseObject(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? clean;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Discovery returned no JSON object");
  return JSON.parse(candidate.slice(start, end + 1));
}

export function parseConceptCandidates(raw: string): ConceptCandidates {
  const parsed = parseObject(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Discovery response is not an object");
  const obj = parsed as Record<string, unknown>;
  const references = Array.isArray(obj.references) ? obj.references : [];
  const roots = Array.isArray(obj.roots) ? obj.roots : [];
  return {
    references: [...new Set(references.filter((v): v is string => typeof v === "string" && /^\d{1,3}:\d{1,3}$/.test(v)))].slice(0, 35),
    roots: [...new Set(roots.filter((v): v is string => typeof v === "string" && /^[\u0621-\u064A\u0671\s-]{2,15}$/.test(v)).map(v => v.trim()))].slice(0, 8),
    queryConcept: typeof obj.queryConcept === "string" ? obj.queryConcept.slice(0, 150) : "",
  };
}

export async function discoverQuranCandidates(
  question: string,
  selected: { chapter: number; verse: number; arabic: string }[],
  key: string,
  model: string,
): Promise<ConceptCandidates> {
  const selection = selected.map(v => `${v.chapter}:${v.verse} ${v.arabic}`).join("\n");
  const response = await fetch("https://llm.chutes.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(40000),
    body: JSON.stringify({
      model,
      temperature: 0.1,
      max_tokens: 1400,
      messages: [
        { role: "system", content: `You assist retrieval from a fixed Qur'anic Arabic corpus. Discover candidate VERSE REFERENCES and ARABIC ROOTS potentially relevant to the user's research question, including conceptual parallels without shared keywords. Do not answer the question and do not compose an analysis. Return ONE JSON object ONLY of this exact shape: {"queryConcept":"short theme","references":["67:2","18:7"],"roots":["بلو","فتن"]}. Return up to 30 distinct references and up to 6 Arabic triliteral roots. Root entries should be Arabic consonantal roots, not inflected words. Candidate references need not be certain: the server will verify them. Favor directly relevant statements, but include different expressions of the concept. Do not claim exhaustiveness. Do not invent a required root when uncertain.` },
        { role: "user", content: `Research question: ${question}\nSelected starting verses (if any):\n${selection || "None"}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`Candidate discovery HTTP ${response.status}`);
  type DiscoveryResponse = {
    model?: string;
    choices?: Array<{
      finish_reason?: string | null;
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
      };
    }>;
    usage?: {
      completion_tokens?: number;
      prompt_tokens?: number;
    };
  };
  const json = await response.json() as DiscoveryResponse;
  const choice = json.choices?.[0];
  const content = choice?.message?.content;

  // Log metadata only. Never log user questions, returned verse text,
  // model reasoning, private passcodes, or credentials.
  console.info("CCC candidate discovery response:", {
    model: json.model ?? model,
    finish_reason: choice?.finish_reason ?? null,
    content_length: typeof content === "string" ? content.length : 0,
    has_reasoning: Boolean(choice?.message?.reasoning_content),
    completion_tokens: json.usage?.completion_tokens ?? null,
    prompt_tokens: json.usage?.prompt_tokens ?? null,
  });

  if (typeof content !== "string" || !content.trim()) {
    const reason = choice?.finish_reason ?? "unknown";
    if (reason === "length") {
      throw new Error("Candidate discovery exhausted its output-token budget before producing final content (finish_reason=length)");
    }
    throw new Error(`Candidate discovery returned no final content (finish_reason=${reason})`);
  }
  return parseConceptCandidates(content);
}
