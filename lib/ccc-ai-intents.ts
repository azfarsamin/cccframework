/**
 * Deterministic Qur'an-only reference listings for explicit lexical/morphology
 * requests. Reuses the SAME indexed morphology implementation as Corpus Search.
 * No AI, hadith, tafsir, Arabic verse API, or prompt-generated references.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildCorpusIndex, queryCorpus, type CorpusToken, type Morphology } from "./ccc-corpus-search";

let indexPromise: Promise<CorpusToken[]> | undefined;
function getIndex(): Promise<CorpusToken[]> {
  indexPromise ??= readFile(path.join(process.cwd(), "public/data/morphology.json"), "utf8")
    .then(raw => buildCorpusIndex(JSON.parse(raw) as Morphology))
    .catch(error => { indexPromise = undefined; throw error; });
  return indexPromise;
}

export function isReferenceOnlyQuestion(question: string): boolean {
  return /(?:\b(?:just|only|solely)\s+(?:(?:list|show|give|provide|output|print)\s+)?(?:(?:the|a|all)\s+)?(?:verse\s+)?(?:numbers?|references?|citations?)\b|\b(?:verse\s+)?(?:numbers?|references?)\s+only\b|\bno\s+arabic\b|\bwithout\s+(?:the\s+)?(?:arabic|quotes?|explanations?|commentary)\b|\b(?:don'?t|do\s+not)\s+(?:output|include|show|print)\s+(?:the\s+)?arabic\b)/i.test(question);
}

export function isListingQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return /\b(?:list|enumerate|show|give|find|identify|count|provide|which|where|how many|concordance)\b/.test(q) &&
    /\b(?:all|every|verses?|references?|occurrences?|verbs?|times|forms?|words?)\b/.test(q);
}

function isAnalytical(question: string): boolean {
  return /\b(?:why|explain|analy[sz]e|analysis|interpret|compare|debate|discuss|evaluate|prove|meaning of|how does)\b/i.test(question);
}

export type DeterministicListing = {
  scope: "lexical" | "morphological";
  label: string;
  occurrences: number;
  references: string[];
  answer: string;
};

function referenceSort(a: string, b: string) {
  const [as, av] = a.split(":").map(Number);
  const [bs, bv] = b.split(":").map(Number);
  return as - bs || av - bv;
}
function render(label: string, scope: DeterministicListing["scope"], rows: CorpusToken[], numbersOnly: boolean): DeterministicListing {
  const references = [...new Set(rows.map(t => t.reference))].sort(referenceSort);
  // Numbers only means precisely that: no Arabic, headings or prefatory prose.
  const answer = numbersOnly ? references.join(", ") :
    `**${label}** — ${rows.length} word occurrences in ${references.length} verses (complete ${scope} match in the local annotated corpus).\n\n` +
    references.join(", ") +
    `\n\nScope: This lists ${scope === "lexical" ? "the stated lemma, not conceptual synonyms" : "the annotated verb form, not other parts of speech"}.`;
  return { scope, label, occurrences: rows.length, references, answer };
}

/** Return null unless the research intent resolves to a specific, auditable target.
 * In particular, do NOT interpret any generic question containing 'wisdom' as
 * a request for the H-K-M root: hikmah, hukm and hakim are distinct lemmas.
 */
export async function resolveDeterministicListing(question: string): Promise<DeterministicListing | null> {
  if (!isListingQuestion(question) || isAnalytical(question)) return null;
  const referenceOnly = isReferenceOnlyQuestion(question);
  const q = question.normalize("NFKC");

  // Explicit lexical naming, or an English 'wisdom' listing: begin with the
  // literal lemma, rather than broad root, knowledge and reason concepts.
  const wisdom = /\bwisdom\b|\bhikmah\b|\bḥikmah\b|\bhikmat\b|حِ?كْمَة|حكمة|الحكمة/i.test(q);
  const rootRequested = /\b(?:root|derivatives?|derived from|every form of)\b/i.test(q);
  if (wisdom && !rootRequested) {
    const index = await getIndex();
    const rows = index.filter(t => t.lemma &&
      // Quranic Arabic Corpus v0.4 Buckwalter Hikomap = حِكْمَة.
      // Formally reject ḥukm and ḥakīm rather than broad-root conflation.
      t.lemma.replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه") === "حكمه"
    );
    return render("ḥikmah (حكمة)", "lexical", rows, referenceOnly);
  }

  const form = /\bform\s*(VIII|VII|VI|IV|III|II|IX|XII|XI|X|V|I)\b/i.exec(q)?.[1]?.toUpperCase();
  if (form && /\bverbs?\b/i.test(q)) {
    const index = await getIndex();
    const rows = queryCorpus(index, { mode: "verb", form, letter: "any", root: "any" });
    return render(`Form ${form} verbs`, "morphological", rows, referenceOnly);
  }
  return null;
}

/** A complete lexical anchor for *analysis* questions. Unlike a plain listing,
 * this does not answer the semantic question itself; it supplies a certified
 * occurrence list for the independent interpretive stage. Never use a root
 * search as a substitute for a lemma search. */
export async function resolveLexicalResearchAnchor(question: string): Promise<DeterministicListing | null> {
  const q = question.normalize("NFKC");
  const wisdom = /\bwisdom\b|\bhikmah\b|\bḥikmah\b|\bhikmat\b|حِ?كْمَة|حكمة|الحكمة/i.test(q);
  if (!wisdom || /\b(?:root|derivatives?|derived from|every form of)\b/i.test(q)) return null;
  const index = await getIndex();
  const rows = index.filter(t => t.lemma &&
    t.lemma.replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآٱ]/g, "ا").replace(/ة/g, "ه") === "حكمه"
  );
  if (!rows.length) throw new Error("The ḥikmah morphology lemma was not found");
  return render("ḥikmah (حكمة)", "lexical", rows, false);
}
