/**
 * CCC Qurʾān Corpus Search — deterministic, Quran-only morphology index.
 * Reads the existing /public/data/morphology.json derived from the
 * Qurʾānic Arabic Corpus v0.4. No AI, hadith or tafsir is used.
 */
export type MorphSegment = [surface: string, tag: string, features: string];
export type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
export type Morphology = Record<string, MorphWord[]>;
export type SearchMode = "root" | "verb";
export type SearchQuery = { mode: SearchMode; letter: string; root: string; form: string };
export type CorpusToken = {
  reference: string;
  chapter: number;
  verse: number;
  position: number; // 1-based word number in source morphology
  root: string; // normalized Arabic root, or '' if not annotated
  lemma: string;
  word: string;
  pos: string;
  form: string; // Form I–XII for verbal stems, '' for nonverbs
  aspect: string;
  voice: string;
};

const bw: Record<string, string> = {
  A:"ا",b:"ب",t:"ت",v:"ث",j:"ج",H:"ح",x:"خ",d:"د","*":"ذ",r:"ر",z:"ز",s:"س","$":"ش",S:"ص",D:"ض",T:"ط",Z:"ظ",E:"ع",g:"غ",f:"ف",q:"ق",k:"ك",l:"ل",m:"م",n:"ن",h:"ه",w:"و",y:"ي","<":"إ",">":"أ","&":"ؤ","}":"ئ",p:"ة",Y:"ى","|":"آ","{":"ٱ",X:"خ","'":"ء",
  a:"َ",i:"ِ",u:"ُ",o:"ْ","~":"ّ",F:"ً",N:"ٌ",K:"ٍ","`":"ٰ","^":"ٓ", "@":""
};
export function buckwalterToArabic(text: string): string {
  return [...text].map(c => bw[c] ?? c).join("");
}
export function normalizeRoot(text: string): string {
  return text.normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\s]/g, "")
    .replace(/[إأآٱ]/g, "ا").replace(/ى/g, "ي")
    .replace(/ؤ/g, "و").replace(/ئ/g, "ي");
}
const romanForms = ["XII", "XI", "VIII", "VII", "VI", "IV", "III", "II", "IX", "X", "V", "I"];
const knownForms = new Set(romanForms);
function verbForm(features: string): string {
  // The corpus omits (I) on basic-form verbs.
  const found = /\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)/.exec(features)?.[1];
  return found && knownForms.has(found) ? found : "I";
}
function stemFor(word: MorphWord): MorphSegment | undefined {
  return word.s.find(s => s[2].split("|").includes("STEM")) ?? word.s.find(s => !s[2].includes("PREFIX") && !s[2].includes("SUFFIX"));
}
export function buildCorpusIndex(data: Morphology): CorpusToken[] {
  if (!data || !data["1:1"] || !data["114:6"] || Object.keys(data).length !== 6236) {
    throw new Error("Incomplete morphology dataset: 6,236 verses are required.");
  }
  const tokens: CorpusToken[] = [];
  for (const [reference, words] of Object.entries(data)) {
    const ref = /^(\d{1,3}):(\d{1,3})$/.exec(reference);
    if (!ref || !Array.isArray(words)) throw new Error(`Invalid morphology entry: ${reference}`);
    const chapter = Number(ref[1]), verse = Number(ref[2]);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (!Array.isArray(w.s)) throw new Error(`Invalid segments at ${reference}:${i + 1}`);
      const stem = stemFor(w);
      const verb = w.s.find(s => s[1] === "V" && s[2].includes("STEM")) ?? w.s.find(s => s[1] === "V");
      const form = verb ? verbForm(verb[2]) : "";
      const features = verb?.[2].split("|") ?? [];
      tokens.push({
        reference, chapter, verse, position: i + 1,
        root: w.r ? normalizeRoot(buckwalterToArabic(w.r)) : "",
        lemma: w.l ? buckwalterToArabic(w.l) : "",
        word: w.s.map(s => buckwalterToArabic(s[0])).join(""),
        pos: verb ? "Verb" : (stem?.[1] === "N" ? "Noun" : stem?.[1] === "ADJ" ? "Adjective" : stem?.[1] === "PN" ? "Proper noun" : stem?.[1] === "PRON" ? "Pronoun" : stem?.[1] === "P" ? "Preposition" : stem?.[1] || "Other"),
        form, aspect: features.includes("PERF") ? "Perfect" : features.includes("IMPF") ? "Imperfect" : features.includes("IMPV") ? "Imperative" : "",
        voice: features.includes("PASS") ? "Passive" : verb ? "Active (unmarked)" : ""
      });
    }
  }
  tokens.sort((a, b) => a.chapter - b.chapter || a.verse - b.verse || a.position - b.position);
  return tokens;
}

export function matchingToken(token: CorpusToken, query: SearchQuery): boolean {
  if (query.mode === "verb") {
    if (!token.form) return false;
    if (query.form !== "any" && token.form !== query.form) return false;
  } else {
    // Root-led, form=Any is a concordance of all annotated root derivatives.
    if (!token.root) return false;
    if (query.form !== "any" && token.form !== query.form) return false;
  }
  if (query.letter !== "any" && !token.root.startsWith(query.letter)) return false;
  if (query.root !== "any" && token.root !== query.root) return false;
  return true;
}
export function queryCorpus(tokens: CorpusToken[], query: SearchQuery): CorpusToken[] {
  return tokens.filter(t => matchingToken(t, query));
}
export function resultCounts(tokens: CorpusToken[]) {
  return {
    occurrences: tokens.length,
    verses: new Set(tokens.map(t => t.reference)).size,
    roots: new Set(tokens.map(t => t.root).filter(Boolean)).size
  };
}
export function corpusForms(tokens: CorpusToken[], root: string, letter: string): string[] {
  const found = new Set(tokens.filter(t => t.form && (root === "any" || t.root === root) && (letter === "any" || t.root.startsWith(letter))).map(t => t.form));
  return FORM_ORDER.filter(f => found.has(f));
}
export const FORM_ORDER = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
export function exportCorpusCsv(rows: CorpusToken[]): string {
  const header = ["verse", "word_position", "arabic_word", "root", "lemma", "part_of_speech", "verb_form", "aspect", "voice"];
  const quote = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return [header.map(quote).join(","), ...rows.map(r => [r.reference, r.position, r.word, r.root, r.lemma, r.pos, r.form, r.aspect, r.voice].map(quote).join(","))].join("\r\n");
}
