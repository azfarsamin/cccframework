/** Generated search index remains a separate optimized store. Never inline its data into TS. */
import searchIndexJson from "../app/research/index.json";
import { assertResearchCatalogCoverage } from "./research-catalog";
type Chunk = {
  id: string; article_id: string; title: string; section: string;
  verse_refs: string[]; topics: string[]; text: string;
  source_kind: "authored_research" | "attributed_external_research"; evidence_role: "argument_not_scripture";
  external_discussion: boolean;
};
type ResearchIndex = { schema_version: number; chunks: Chunk[]; articles: { id: string; title: string; source_path: string }[] };
// Static import ensures the index is bundled into the Vercel serverless function.
// Avoid process.cwd()/fs lookup: files not statically referenced may be excluded.
const researchIndex = searchIndexJson as unknown as ResearchIndex;
assertResearchCatalogCoverage(researchIndex.articles.map(article => article.id));

async function index(): Promise<ResearchIndex> {
  if (researchIndex.schema_version !== 1 || !Array.isArray(researchIndex.chunks)) {
    throw new Error("Unsupported research index");
  }
  return researchIndex;
}

const aliases: Record<string, string[]> = {
  "4:82": ["coherence", "contradiction", "quran", "self consistency", "truth"],
  "39:18": ["listen", "evaluate", "follow the best", "discernment", "calibration"],
  "49:6": ["verification", "news", "evidence", "inquiry"],
  "2:256": ["no compulsion", "religion", "freedom", "belief"],
  "55:7": ["balance", "measure", "mizan", "calibration"],
  "55:8": ["balance", "measure", "mizan", "calibration"],
  "55:9": ["balance", "measure", "mizan", "calibration"],
  "57:25": ["balance", "measure", "mizan", "justice"],
  "75:17": ["collection", "recitation", "preservation", "explanation"],
  "15:9": ["preservation", "quran", "remembrance", "manuscripts"],
  "25:1": ["furqan", "criterion", "truth", "discernment"],
  "30:30": ["fitrah", "human nature", "truth", "calibration"],
  "91:1": ["shams", "ring composition", "structure", "oath"],
  "2:275": ["riba", "ribā", "interest", "sale", "trade", "money", "debt"],
  "2:276": ["riba", "charity", "interest", "increase"],
  "2:278": ["riba", "interest", "remaining", "repentance"],
  "2:279": ["principal", "capital", "riba", "interest", "debt"],
  "2:282": ["debt", "loan", "documentation", "witness", "credit"],
  "3:130": ["riba", "usury", "interest", "doubled", "compounding"],
  "4:161": ["riba", "usury", "wealth", "interest"],
  "30:39": ["riba", "ribā", "increase", "wealth", "zakat", "giving"],
  "59:7": ["wealth", "concentration", "distribution"],
  "25:5": ["iktatabaha", "iktatabahā", "writing", "dictation", "prophetic literacy", "he wrote", "quran", "revelation"],
  "29:48": ["qablihi", "prior scripture", "before it", "writing", "read", "literacy", "ummi"],
  "2:78": ["ummi", "ummiyyun", "unscriptured", "scripture", "unlettered"],
  "28:10": ["fuad", "fuʾād", "qalb", "heart", "mother of moses", "rabat", "moral reasoning", "perception"],
  "17:36": ["knowledge", "accountability", "verification", "epistemology", "fuad", "fuʾād", "sam", "basar", "faculties"],
  "22:46": ["qalb", "qulub", "reason", "reasoning", "heart", "chest", "moral cognition"],
  "7:179": ["qalb", "qulub", "yafqahun", "hearts", "understanding", "perception"],
  "53:11": ["fuad", "fuʾād", "inner perception", "saw", "vision"],
  "11:120": ["fuad", "fuʾād", "stabilize", "make firm", "thabat"],
  "14:43": ["afidah", "afʾidah", "fuad", "empty", "terror"],
  "46:26": ["fuad", "afidah", "hearing", "vision", "rejection"],
  "16:78": ["afidah", "fuad", "hearing", "vision", "perception"],
  "23:78": ["afidah", "fuad", "hearing", "vision"],
  "67:23": ["afidah", "fuad", "hearing", "vision"],
  "91:7": ["nafs", "purification", "moral calibration"],
  "91:8": ["nafs", "deviation", "restraint", "calibration"],
  "91:9": ["nafs", "purification", "success"],
  "91:10": ["nafs", "corruption", "failure"],
  "7:157": ["ummi", "prophet", "unscriptured", "literacy"],
  "7:158": ["ummi", "prophet", "unscriptured", "literacy"],
  "62:2": ["ummiyyin", "unscriptured", "book", "teaching"],
  "98:2": ["suhuf", "pages", "written revelation", "reciting"],
  "80:13": ["suhuf", "safarah", "scribes", "written revelation"],
  "52:2": ["kitab", "masṭūr", "raqq", "parchment", "writing"],
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
    const score = (exactVerse ? 24 + Math.min(12, (chunk.text.match(new RegExp(verseRef!.replace(":", "\\:"), "g")) || []).length * 3) : 0) + (verseRef && section.includes(verseRef) ? 12 : 0) + matchCount * 2 + searchTerms.filter(term => section.includes(term) || topics.has(term)).length * 3 - (chunk.external_discussion ? 2 : 0);
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


/**
 * v7.9: Expand retrieved research hits to their ENTIRE indexed sections.
 * A table and its argument can span multiple chunks; returning individual hits
 * strips premises and misleads the model into claiming that evidence was absent.
 * No subject, verse, school, or article conclusion receives a special rule.
 */
export type ResearchEvidenceUnit = {
  key: string; articleId: string; title: string; section: string; text: string;
  verseRefs: string[]; citationFrequency: Record<string, number>; chunkIds: string[]; complete: boolean; score: number;
};
export async function expandResearchEvidence(
  hits: ResearchHit[], maxUnits = 7, maxCharacters = 15500,
): Promise<ResearchEvidenceUnit[]> {
  const data = await index();
  const chosen = new Map<string, { hit: ResearchHit; score: number }>();
  for (const hit of hits) {
    const key = `${hit.articleId}::${hit.section}`;
    const previous = chosen.get(key);
    if (!previous || hit.score > previous.score) chosen.set(key, { hit, score:hit.score });
  }
  const candidates = [...chosen.entries()].sort((a,b) => b[1].score-a[1].score || a[0].localeCompare(b[0]));
  const output: ResearchEvidenceUnit[] = [];
  let remaining = maxCharacters;
  for (const [key, {hit,score}] of candidates) {
    if (output.length >= maxUnits || remaining < 450) break;
    const pieces = data.chunks.filter(c => c.article_id === hit.articleId && c.section === hit.section);
    if (!pieces.length) continue;
    const full = pieces.map(c => c.text).join("\n\n");
    // Keep as many entire sections as the budget permits. Trim only an
    // exceptionally long section, and expose truncation explicitly.
    const allowance = Math.min(6500, remaining);
    const complete = full.length <= allowance;
    const selected = complete ? full : full.slice(0, allowance);
    const citationFrequency:Record<string,number> = {};
    for(const c of pieces) for(const ref of new Set(c.verse_refs)) {
      citationFrequency[ref] = (citationFrequency[ref] || 0) + 1;
    }
    output.push({key,articleId:hit.articleId,title:hit.title,section:hit.section,
      text:selected,verseRefs:[...new Set(pieces.flatMap(c=>c.verse_refs))],citationFrequency,
      chunkIds:pieces.map(c=>c.id),complete,score});
    remaining -= selected.length;
  }
  return output;
}


/** Reference leads from nearby sections in the SAME indexed work. The section
 * ordering is metadata, not a doctrine-specific cross-reference rule.
 * These leads fetch Qurʾānic text; they do not import the neighboring article's
 * claims into the argument reconstruction unless that section is selected.
 */
export async function neighboringResearchReferences(units:ResearchEvidenceUnit[], radius = 2, limit = 20):Promise<string[]> {
  const data = await index();
  const leadScores = new Map<string, number>();
  for (const unit of units.slice(0, 7)) {
    const m = /:s(\d+):c\d+$/.exec(unit.chunkIds[0] || "");
    if (!m) continue;
    const origin = Number(m[1]);
    for (const c of data.chunks) {
      if (c.article_id !== unit.articleId) continue;
      const part = /:s(\d+):c\d+$/.exec(c.id);
      if (!part) continue;
      const distance = Math.abs(Number(part[1]) - origin);
      if (distance === 0 || distance > radius) continue;
      for (const ref of c.verse_refs) leadScores.set(ref,(leadScores.get(ref)||0) + (radius+1-distance));
    }
  }
  return [...leadScores.entries()].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,limit).map(([ref])=>ref);
}

/** v7.12.4: Topic-neutral section relevance gate. A section that cites the
 * focal verse incidentally must not become a new claim in the reconstruction.
 * Relevance is graded by citation concentration and section heading.
 * No doctrinal viewpoint receives a bonus or exclusion.
 */
export function rankRelevantResearch(verseRef: string, units: ResearchEvidenceUnit[], maxUnits = 3): {
  accepted: ResearchEvidenceUnit[]; rejected: ResearchEvidenceUnit[];
} {
  const scored = units.map(unit => {
    const textCitations = [...unit.text.matchAll(/\b(\d{1,3}:\d{1,3})\b/g)].map(m => m[1]);
    const direct = textCitations.filter(x => x === verseRef).length;
    const total = textCitations.length;
    const density = direct / Math.max(1, total);
    const metadata = unit.verseRefs.includes(verseRef);
    const headingMentionsVerse = unit.section.includes(verseRef);
    const heading = normalize(unit.section);
    const genericMethod = /(?:method of interpretation|methodology|text grammar and context|general framework)/i.test(heading);
    const score = (metadata ? 12 : 0) + Math.min(5, direct) * 5 + density * 40 +
      (headingMentionsVerse ? 15 : 0) - (genericMethod ? 18 : 0) -
      (total > 10 && direct <= 1 ? 8 : 0);
    return {unit,score,direct,metadata};
  }).filter(x => x.metadata || x.direct > 0)
    .sort((a,b) => b.score-a.score || b.unit.score-a.unit.score || a.unit.key.localeCompare(b.unit.key));
  const accepted = scored.filter(x => x.score >= 10).slice(0,maxUnits).map(x => x.unit);
  const keys = new Set(accepted.map(x => x.key));
  return { accepted, rejected:units.filter(u => !keys.has(u.key)) };
}
