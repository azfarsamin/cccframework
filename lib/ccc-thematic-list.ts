/**
 * Validate model-proposed thematic classifications before displaying them.
 * The server, never the language model, owns the final verse references and
 * Arabic quotations. Classification/relevance remains an inference.
 */
export type ThematicCategory = "general" | "situational" | "historical";
export type ClassifiedVerse = {
  reference: string;
  category: ThematicCategory;
  explanation: string;
};

function extractJson(raw: string): unknown {
  const clean = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fenced = clean.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? clean;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Thematic classifier returned no JSON object");
  return JSON.parse(source.slice(start, end + 1));
}

export function parseVerifiedThematicList(raw: string, supplied: ReadonlySet<string>): ClassifiedVerse[] {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid thematic JSON");
  const items = (parsed as { verses?: unknown }).verses;
  if (!Array.isArray(items)) throw new Error("Thematic JSON is missing a verses array");
  const seen = new Set<string>();
  const output: ClassifiedVerse[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const reference = typeof entry.reference === "string" ? entry.reference.trim() : "";
    const category = entry.category;
    const explanation = typeof entry.explanation === "string" ? entry.explanation.trim() : "";
    if (!supplied.has(reference) || seen.has(reference)) continue;
    if (category !== "general" && category !== "situational" && category !== "historical") continue;
    if (!explanation || explanation.length > 260) continue;
    // Explanation is model interpretation, never a fabricated Arabic quote.
    if (/[\r\n]/.test(explanation)) continue;
    seen.add(reference);
    output.push({ reference, category, explanation });
  }
  return output.sort((a, b) => {
    const rank = { general: 0, situational: 1, historical: 2 };
    if (rank[a.category] !== rank[b.category]) return rank[a.category] - rank[b.category];
    const [ac, av] = a.reference.split(":").map(Number);
    const [bc, bv] = b.reference.split(":").map(Number);
    return ac - bc || av - bv;
  });
}

export function formatVerifiedThematicList(
  items: ClassifiedVerse[],
  arabicByReference: ReadonlyMap<string, string>,
  evidenceCount: number,
  excerptTruncated: boolean,
): string {
  const groups: { category: ThematicCategory; heading: string }[] = [
    { category: "general", heading: "General principles about the test of life" },
    { category: "situational", heading: "Particular tests and circumstances" },
    { category: "historical", heading: "Historical examples and reported statements" },
  ];
  const lines = [
    "## Verified thematic Qurʾānic references",
    `**${items.length} relevant passages selected from ${evidenceCount} corpus-verified candidate verses.**`,
    "",
    "These references and Arabic quotations were checked against the corpus. Their thematic classification and brief descriptions are model interpretations, not independently proven semantic labels.",
    "",
  ];
  for (const group of groups) {
    const subset = items.filter(v => v.category === group.category);
    if (!subset.length) continue;
    lines.push(`### ${group.heading}`, "");
    for (const verse of subset) {
      const arabic = arabicByReference.get(verse.reference);
      if (!arabic) continue;
      lines.push(`**${verse.reference}** — ${verse.explanation}`, "", arabic, "");
    }
  }
  if (!items.length) lines.push("No confidently classified passages were returned from the verified candidates.", "");
  lines.push(`**Coverage:** This is a thematic search, NOT an exhaustive list of all conceptually related Qurʾānic verses.${excerptTruncated ? " The candidate evidence excerpt was also truncated before classification." : ""} No independently verified claim of conceptual completeness is made.`);
  return lines.join("\n");
}
