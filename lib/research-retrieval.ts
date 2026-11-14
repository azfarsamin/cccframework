import { readFile } from "node:fs/promises";
import path from "node:path";

type Chunk = {
  id: string; article_id: string; title: string; section: string;
  verse_refs: string[]; topics: string[]; text: string;
  source_kind: "authored_research"; evidence_role: "argument_not_scripture";
  external_discussion: boolean;
};
type ResearchIndex = { schema_version: number; chunks: Chunk[]; articles: { id: string; title: string; source_path: string }[] };
let cached: ResearchIndex | undefined;

async function index(): Promise<ResearchIndex> {
  if (!cached) {
    const raw = await readFile(path.join(process.cwd(), "research/index.json"), "utf8");
    const value = JSON.parse(raw) as ResearchIndex;
    if (value.schema_version !== 1 || !Array.isArray(value.chunks)) throw new Error("Unsupported research index");
    cached = value;
  }
  return cached;
}

const aliases: Record<string, string[]> = {
  "65:4": ["nisa", "nisāʾ", "marriage", "maturity", "waiting period", "menstruation", "iddah"],
  "4:6": ["rushd", "maturity", "balaghu", "nikah", "orphans", "marriage"],
  "4:19": ["consent", "marriage", "women"],
  "4:21": ["covenant", "marriage", "mithaq"],
};
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "").replace(/[^\p{L}\p{N}:]+/gu, " ").trim();
}
function terms(text: string): string[] {
  return [...new Set(normalize(text).split(/\s+/).filter(word => word.length > 2))].slice(0, 18);
}
export type ResearchHit = {
  id: string; articleId: string; title: string; section: string;
  verseRefs: string[]; text: string; score: number; evidenceRole: "argument_not_scripture";
  externalDiscussion: boolean;
};

/** Server-only hybrid retrieval. The Qur'an corpus remains authoritative; articles are attributed arguments. */
export async function searchResearch(query: string, verseRef?: string, limit = 4): Promise<ResearchHit[]> {
  const data = await index();
  const qTerms = terms(query);
  const aliasTerms = verseRef ? (aliases[verseRef] || []).flatMap(terms) : [];
  const searchTerms = [...new Set([...qTerms, ...aliasTerms])];
  const scored: ResearchHit[] = [];
  for (const chunk of data.chunks) {
    const exactVerse = Boolean(verseRef && chunk.verse_refs.includes(verseRef));
    const section = normalize(chunk.section);
    const topics = new Set(chunk.topics.flatMap(terms));
    const body = normalize(chunk.text);
    const matchCount = searchTerms.filter(term => body.includes(term) || section.includes(term) || topics.has(term)).length;
    const score = (exactVerse ? 24 : 0) + matchCount * 2 + searchTerms.filter(term => section.includes(term) || topics.has(term)).length * 3 - (chunk.external_discussion ? 2 : 0);
    if (score <= 0 || (!exactVerse && matchCount === 0)) continue;
    scored.push({ id: chunk.id, articleId: chunk.article_id, title: chunk.title,
      section: chunk.section, verseRefs: chunk.verse_refs, text: chunk.text,
      score, evidenceRole: chunk.evidence_role, externalDiscussion: chunk.external_discussion });
  }
  return scored.sort((a,b) => b.score-a.score || a.id.localeCompare(b.id)).slice(0, Math.min(Math.max(limit,1),12));
}

export function formatResearchContext(hits: ResearchHit[], maxCharacters = 5000): string {
  if (!hits.length) return "No directly relevant indexed research excerpts were found.";
  let used = 0;
  const lines: string[] = [];
  for (const hit of hits) {
    const header = `[Research ${hit.id}] ${hit.title} — ${hit.section} (authored argument; NOT primary Qur'anic evidence; verses: ${hit.verseRefs.join(", ")})`;
    const budget = Math.min(2000, maxCharacters-used-header.length);
    if (budget < 200) break;
    lines.push(`${header}\n${hit.text.slice(0,budget)}`);
    used += header.length + Math.min(hit.text.length,budget);
  }
  return lines.join("\n\n");
}
