import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ConceptCandidates } from "./ccc-conceptual";

export type ResearchVerse = { chapter: number; verse: number; arabic: string };
type MorphSegment = [string, string, string];
type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
type Morphology = Record<string, MorphWord[]>;
type ArabicSurah = { number: number; ayahs: { numberInSurah: number; text: string }[] };

type Concordance = {
  term: string;
  totalOccurrences: number;
  references: { reference: string; count: number }[];
};
export type RetrievalResult = {
  text: string;
  concordance: Concordance | null;
  concordanceVerses: { reference: string; count: number; arabic: string }[];
  diagnostics: {
    thematicCandidates?: number;
    thematicVerified?: number;
    thematicRoots?: string[];
    thematicPartial?: boolean;
    selectedCount: number;
    queryTerm: string | null;
    totalWordOccurrences: number;
    matchingVerses: number;
    retrievedAdditionalVerses: number;
    exhaustiveLexicalIndex: boolean;
    source: string;
  };
};

let morphologyPromise: Promise<Morphology> | undefined;
async function getMorphology() {
  morphologyPromise ??= readFile(path.join(process.cwd(), "public/data/morphology.json"), "utf8")
    .then(t => JSON.parse(t) as Morphology)
    .catch(e => { morphologyPromise = undefined; throw e; });
  return morphologyPromise;
}

let arabicPromise: Promise<Map<string, string>> | undefined;
async function getArabicCorpus() {
  arabicPromise ??= (async () => {
    const response = await fetch("https://api.alquran.cloud/v1/quran/quran-uthmani", {
      signal: AbortSignal.timeout(20000), next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Arabic corpus provider HTTP ${response.status}`);
    const payload = await response.json() as { data?: { surahs?: ArabicSurah[] } };
    if (payload.data?.surahs?.length !== 114) throw new Error("Incomplete Arabic corpus response");
    const verses = new Map<string, string>();
    for (const surah of payload.data.surahs) for (const a of surah.ayahs) {
      verses.set(`${surah.number}:${a.numberInSurah}`, a.text);
    }
    if (verses.size !== 6236) throw new Error(`Expected 6236 verses; got ${verses.size}`);
    return verses;
  })().catch(e => { arabicPromise = undefined; throw e; });
  return arabicPromise;
}

const buckwalter: Record<string, string> = {
  "'":"ء", "|":"آ", ">":"أ", "&":"ؤ", "<":"إ", "}":"ئ", "A":"ا", "b":"ب", "p":"ة", "t":"ت",
  "v":"ث", "j":"ج", "H":"ح", "x":"خ", "d":"د", "*":"ذ", "r":"ر", "z":"ز", "s":"س", "$":"ش",
  "S":"ص", "D":"ض", "T":"ط", "Z":"ظ", "E":"ع", "g":"غ", "f":"ف", "q":"ق", "k":"ك", "l":"ل",
  "m":"م", "n":"ن", "h":"ه", "w":"و", "Y":"ى", "y":"ي", "`":"ٰ", "{":"ٱ", "P":"پ", "V":"ڤ", "G":"گ",
};
function asArabic(s: string) { return [...s].map(ch => buckwalter[ch] ?? ch).join(""); }
function norm(s: string) {
  return s.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/[ى]/g, "ي").replace(/[ؤ]/g, "و").replace(/[ئ]/g, "ي")
    .replace(/[^\u0621-\u064A]/g, "");
}
function isNominal(word: MorphWord) {
  return word.s.some(segment => /(?:^|\|)POS:N(?:\||$)/.test(segment[2]));
}

// Exact, audited lemma groups for transliterated queries. Arabic-script terms
// can also be matched to the normalized Buckwalter lemma automatically.
const auditedTerms = [
  { label: "ribā", match: /(?:^|[^a-z])rib[aā](?:$|[^a-z])|الربا|\bربا\b/i,
    lemmas: new Set(["r~ibaw`A", "r~ib"]), nominalOnly: true },
  { label: "ummī", match: /(?:^|[^a-z])umm[iī](?:yy?[a-zāīū]*)?(?:$|[^a-z])|أمّي|الأمي|اميين|أميين/i,
    lemmas: new Set([">um~iY~"]), nominalOnly: false },
];

type Target = { label: string; test: (w: MorphWord) => boolean };
function inferTarget(question: string, selected: ResearchVerse[], morph: Morphology): Target | null {
  for (const candidate of auditedTerms) {
    if (candidate.match.test(question)) {
      return { label: candidate.label, test: w => !!w.l && candidate.lemmas.has(w.l) && (!candidate.nominalOnly || isNominal(w)) };
    }
  }
  // Arabic-script keywords: find an exact normalized lemma form (not a root guess).
  // Only use sufficiently long tokens to avoid triggering on common particles.
  const arabicTerms = Array.from(question.matchAll(/[\u0621-\u064A\u064B-\u065F\u0670\u0671]{3,}/g), m => norm(m[0]));
  if (arabicTerms.length) {
    const lemmaIndex = new Map<string, Set<string>>();
    for (const words of Object.values(morph)) for (const word of words) if (word.l) {
      const canonical = norm(asArabic(word.l));
      const aliases = [canonical, canonical.replace(/^ال/, "")];
      for (const alias of aliases) {
        if (!lemmaIndex.has(alias)) lemmaIndex.set(alias, new Set());
        lemmaIndex.get(alias)!.add(word.l);
      }
    }
    for (const token of arabicTerms) {
      const lemmas = lemmaIndex.get(token) ?? lemmaIndex.get(token.replace(/^ال/, ""));
      if (lemmas?.size === 1) {
        const chosen = [...lemmas][0];
        return { label: token, test: w => w.l === chosen };
      }
    }
  }
  // Do not guess a research term from the selected passage: it may contain
  // multiple candidates, and the question may be about something else.
  void selected;
  return null;
}

function sortRefs(a: string, b: string) {
  const [ac,av] = a.split(":").map(Number), [bc,bv] = b.split(":").map(Number);
  return ac - bc || av - bv;
}

export async function retrieveQuranContext(selected: ResearchVerse[], question: string): Promise<RetrievalResult> {
  // The complete indexed morphology is local. Fetch Arabic excerpts only if needed.
  const morphology = await getMorphology();
  const target = inferTarget(question, selected, morphology);
  const selectedRefs = new Set(selected.map(v => `${v.chapter}:${v.verse}`));
  const references: { reference: string; count: number }[] = [];
  if (target) {
    for (const [reference, words] of Object.entries(morphology)) {
      const count = words.filter(target.test).length;
      if (count) references.push({ reference, count });
    }
    references.sort((a,b) => sortRefs(a.reference, b.reference));
  }
  const concordance: Concordance | null = target ? {
    term: target.label,
    totalOccurrences: references.reduce((sum, v) => sum + v.count, 0),
    references,
  } : null;
  // Pure methodological questions require no Arabic API call.
  const arabic = target || selected.length ? await getArabicCorpus() : new Map<string, string>();
  const ordered = new Set<string>();
  // Include ALL matching references when possible; if too many, retain complete
  // reference list above and bound the verse excerpt length for the model.
  for (const r of references) if (!selectedRefs.has(r.reference)) ordered.add(r.reference);
  for (const verse of selected.slice(0, 8)) for (const delta of [-1,1]) {
    const reference = `${verse.chapter}:${verse.verse + delta}`;
    if (arabic.has(reference) && !selectedRefs.has(reference)) ordered.add(reference);
  }
  const snippets: string[] = [];
  let length = 0;
  for (const ref of ordered) {
    const text = arabic.get(ref);
    if (!text || snippets.length >= 40 || length + text.length > 16000) break;
    snippets.push(`${ref} ${text}`); length += text.length;
  }
  const title = concordance ?
    `COMPLETE LEXICAL CONCORDANCE (morphology index; all 6236 numbered verses): ${concordance.term}: ${concordance.totalOccurrences} WORD OCCURRENCES across ${references.length} verses.\n` +
    `Verified counts per verse: ${references.map(r => `${r.reference} (${r.count})`).join(", ")}.` :
    "NO QUERY TERM RESOLVED: This system has not conducted an exhaustive lexical concordance for the research question. Do not imply otherwise. Question-driven term resolution currently supports audited transliterations (including ribā, ummī) and unambiguous Arabic-script lemma forms; unrelated conceptual retrieval is not yet implemented.";
  return {
    text: `${title}\n\nADDITIONAL ARABIC VERSES:\n${snippets.length ? snippets.join("\n") : "None retrieved."}\n\nScope: complete lexical matching only for the reported target. Not a complete semantic or conceptual search. Morphological annotation is interpretive data. If excerpts are truncated, report that fact.`,
    concordance,
    // Include verse text only when the complete list fits a reasonable response.
    // The complete verse reference/count list remains available regardless.
    concordanceVerses: references.length <= 50 && references.reduce((n, r) => n + (arabic.get(r.reference)?.length ?? 0), 0) <= 18000
      ? references.map(r => ({ reference: r.reference, count: r.count, arabic: arabic.get(r.reference) ?? "" }))
      : [],
    diagnostics: {
      selectedCount: selected.length,
      queryTerm: target?.label ?? null,
      totalWordOccurrences: concordance?.totalOccurrences ?? 0,
      matchingVerses: references.length,
      retrievedAdditionalVerses: snippets.length,
      exhaustiveLexicalIndex: !!target,
      source: "Qur'anic Arabic Corpus v0.4 morphology + Al Quran Cloud quran-uthmani",
    },
  };
}


/** Verify model-proposed references against BOTH indexed morphology and Arabic
 * verses. A valid citation is not proof that its theme is relevant. Root
 * matches are exhaustive for that ROOT, not for the whole semantic concept.
 */
export async function retrieveConceptualContext(
  selected: ResearchVerse[],
  candidates: ConceptCandidates,
): Promise<{
  text: string;
  diagnostics: { candidateReferences: number; validReferences: number; matchingRootVerses: number; sentVerses: number; roots: string[]; truncated: boolean };
}> {
  const [morphology, arabic] = await Promise.all([getMorphology(), getArabicCorpus()]);
  const indexRoots = new Map<string, Set<string>>();
  for (const words of Object.values(morphology)) for (const word of words) if (word.r) {
    const arabicRoot = norm(asArabic(word.r));
    if (!indexRoots.has(arabicRoot)) indexRoots.set(arabicRoot, new Set());
    indexRoots.get(arabicRoot)!.add(word.r);
  }
  const roots = new Set<string>();
  for (const suggested of candidates.roots) {
    const matches = indexRoots.get(norm(suggested));
    if (matches?.size === 1) roots.add([...matches][0]);
  }
  const rootHits: string[] = [];
  if (roots.size) for (const [ref, words] of Object.entries(morphology)) {
    if (words.some(w => w.r && roots.has(w.r))) rootHits.push(ref);
  }
  rootHits.sort(sortRefs);
  const direct = [...new Set([...selected.map(v => `${v.chapter}:${v.verse}`), ...candidates.references])]
    .filter(r => morphology[r] && arabic.has(r));
  const directSet = new Set(direct);
  const extra = rootHits.filter(r => !directSet.has(r));
  // The model's references are prioritized, then lexical family results.
  // Bounded output avoids swallowing the Chutes model context.
  const ordered = [...direct, ...extra];
  const verses: string[] = [];
  let chars = 0;
  for (const ref of ordered) {
    const verse = arabic.get(ref);
    if (!verse) continue;
    const addition = `${ref} ${verse}`;
    if (verses.length >= 65 || chars + addition.length > 23000) break;
    verses.push(addition);
    chars += addition.length;
  }
  const omitted = ordered.length - verses.length;
  const rootNames = [...roots].map(r => asArabic(r));
  const header = [
    'THEMATIC RETRIEVAL — CANDIDATE DISCOVERY AND CORPUS VERIFICATION',
    `Research theme: ${candidates.queryConcept || 'User question'}`,
    `Model-proposed references: ${candidates.references.length}; valid Qur'anic references: ${direct.filter(r => candidates.references.includes(r)).length}.`,
    `Corpus-confirmed Arabic roots: ${rootNames.join(', ') || 'none'}.`,
    `Verses containing these roots (lexically exhaustive for each accepted root): ${rootHits.length}.`,
    `Verified Arabic passages supplied below: ${verses.length}; omitted because of excerpt budget: ${Math.max(0, omitted)}.`,
    'CAUTION: This is NOT an exhaustive conceptual concordance. A proposed reference has been checked to exist and its Arabic text retrieved, but its semantic relevance has NOT been independently certified. Root matches may include unrelated meanings. Assess each passage and exclude false positives. Do not say "only these verses" or "all relevant verses".',
  ];
  return {
    text: `${header.join('\n')}\n\nVERIFIED ARABIC VERSES (candidate relevance to be evaluated):\n${verses.join('\n') || 'None.'}`,
    diagnostics: {
      candidateReferences: candidates.references.length,
      validReferences: direct.filter(r => candidates.references.includes(r)).length,
      matchingRootVerses: rootHits.length,
      sentVerses: verses.length,
      roots: rootNames,
      truncated: omitted > 0,
    },
  };
}
