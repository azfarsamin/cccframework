"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./quran.module.css";

type Surah = { number: number; name: string; englishName: string; numberOfAyahs: number };
type Ayah = { numberInSurah: number; text: string };
type QuranResponse<T> = { code: number; data: T };
type TranslationEdition = "en.asad" | "en.sahih" | "en.yusufali" | "en.pickthall" | "en.itani" | "gerrans";
const editions: { id: TranslationEdition; name: string }[] = [
  { id: "en.asad", name: "Muhammad Asad" },
  { id: "en.sahih", name: "Saheeh International" },
  { id: "en.yusufali", name: "Abdullah Yusuf Ali" },
  { id: "en.pickthall", name: "Marmaduke Pickthall" },
  { id: "en.itani", name: "Talal Itani" },
  { id: "gerrans", name: "Sam Gerrans" },
];
type GerransMap = Record<string, string>;
type FullSurah = { number: number; ayahs: Ayah[] };
type SearchResult = { chapter: number; verse: number; arabic: string; english: string };
const MAX_SEARCH_RESULTS = 100;

function normalizeArabic(value: string) {
  return value.normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}


type MorphSegment = [string, string, string];
type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
type Morphology = Record<string, MorphWord[]>;
type WordChoice = { reference: string; index: number; display: string };
type RootHit = { reference: string; index: number; lemma: string | null };

// Match displayed Arabic words to corpus word positions, never by raw index alone.
// Orthographic normalization is used for matching only; it never changes the source text.
function wordKey(value: string): string {
  return normalizeArabic(value)
    .replace(/\u0671/g, "ا")
    .replace(/\u06E5/g, "و")
    .replace(/\u06E6/g, "ي")
    .replace(/[^\u0621-\u064A]/g, "");
}

function corpusWordKey(word: MorphWord): string {
  return wordKey(word.s.map(segment => translitToArabic(segment[0])).join(""));
}

// Returns a corpus index per displayed word, or null if it cannot be verified.
// LCS preserves order across extra orthographic tokens and avoids shifting later words.
function alignVerseWords(displayed: string[], corpusWords: MorphWord[]): (number | null)[] {
  const source = displayed.map(wordKey);
  const target = corpusWords.map(corpusWordKey);
  const n = source.length, m = target.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = source[i] && source[i] === target[j]
        ? 1 + dp[i + 1][j + 1]
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: (number | null)[] = Array<number | null>(n).fill(null);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (source[i] && source[i] === target[j] && dp[i][j] === dp[i + 1][j + 1] + 1) {
      result[i] = j + 1; // corpus positions are 1-based
      i++; j++;
    } else if (dp[i + 1][j] > dp[i][j + 1]) i++;
    else if (dp[i + 1][j] < dp[i][j + 1]) j++;
    else { // ambiguous skip direction: do not force a mapping at this token
      i++;
    }
  }
  // A word repeated a different number of times across editions is ambiguous.
  const aCounts = new Map<string, number>();
  const bCounts = new Map<string, number>();
  for (const key of source) aCounts.set(key, (aCounts.get(key) || 0) + 1);
  for (const key of target) bCounts.set(key, (bCounts.get(key) || 0) + 1);
  return result.map((index, at) =>
    index !== null && aCounts.get(source[at]) === bCounts.get(source[at]) ? index : null
  );
}

const buckwalterArabic: Record<string, string> = {
  A: "ا", b: "ب", t: "ت", v: "ث", j: "ج", H: "ح", x: "خ", d: "د", '*': "ذ", r: "ر", z: "ز", s: "س", '$': "ش", S: "ص", D: "ض", T: "ط", Z: "ظ", E: "ع", g: "غ", f: "ف", q: "ق", k: "ك", l: "ل", m: "م", n: "ن", h: "ه", w: "و", y: "ي", '<': "إ", '>': "أ", '&': "ؤ", '}': "ئ", p: "ة", Y: "ى", '|': "آ", '{': "ٱ", 'X': "خ"
};
function translitToArabic(value: string) {
  // Buckwalter vowels/diacritics are not independent Arabic letters.
  const marks = new Set(["a", "i", "u", "o", "~", "F", "N", "K", "`", "^"]);
  return Array.from(value).filter(c => !marks.has(c)).map(c => buckwalterArabic[c] || c).join("");
}
const partOfSpeechLabels: Record<string,string> = {
  DET: "Definite article", N: "Noun", PN: "Proper noun", V: "Verb",
  ADJ: "Adjective", PRON: "Pronoun", P: "Preposition", CONJ: "Conjunction",
  REL: "Relative pronoun", DEM: "Demonstrative", NEG: "Negation particle",
  ACC: "Accusative particle", VOC: "Vocative particle", INTG: "Interrogative",
  ADV: "Adverb", INL: "Initial letters", NUM: "Number", T: "Time adverb"
};
const featureLabels: Record<string,string> = {
  NOM: "Nominative", ACC: "Accusative", GEN: "Genitive",
  M: "Masculine", F: "Feminine", S: "Singular", D: "Dual", P: "Plural",
  DEF: "Definite", INDEF: "Indefinite", PERF: "Perfect", IMPF: "Imperfect",
  IMPV: "Imperative", ACT: "Active", PASS: "Passive", IND: "Indicative",
  SUBJ: "Subjunctive", JUS: "Jussive", MS: "Masculine singular",
  FS: "Feminine singular", MP: "Masculine plural", FP: "Feminine plural"
};
const verbFormLabels: Record<string, string> = {
  I: "Form I", II: "Form II", III: "Form III", IV: "Form IV", V: "Form V",
  VI: "Form VI", VII: "Form VII", VIII: "Form VIII", IX: "Form IX",
  X: "Form X", XI: "Form XI", XII: "Form XII"
};
const personLabels: Record<string, string> = {
  "1S": "First-person singular (I)", "1P": "First-person plural (we)",
  "2MS": "Second-person masculine singular (you)",
  "2FS": "Second-person feminine singular (you)",
  "2D": "Second-person dual (you two)",
  "2MP": "Second-person masculine plural (you)",
  "2FP": "Second-person feminine plural (you)",
  "3MS": "Third-person masculine singular (he)",
  "3FS": "Third-person feminine singular (she)",
  "3D": "Third-person dual (they two)",
  "3MD": "Third-person masculine dual (they two)",
  "3FD": "Third-person feminine dual (they two)",
  "3MP": "Third-person masculine plural (they)",
  "3FP": "Third-person feminine plural (they)"
};
type GrammarDetail = { label: string; value: string };
function describeSegment(segment: MorphSegment): GrammarDetail[] {
  const features = segment[2].split("|");
  const kind = segment[1];
  const valueFor = (prefix: string) => features.find(f => f.startsWith(prefix))?.slice(prefix.length);
  const personCode = valueFor("PRON:") || features.find(f => personLabels[f]);
  const form = features.map(f => /^\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)$/.exec(f)?.[1]).find(Boolean);
  const detail: GrammarDetail[] = [];
  if (kind === "V") {
    detail.push({ label: "Part of speech", value: "Verb" });
    detail.push({ label: "Verb form", value: form ? verbFormLabels[form] : "Form I (unmarked basic form)" });
    const aspect = features.includes("PERF") ? "Perfect" : features.includes("IMPF") ? "Imperfect" : features.includes("IMPV") ? "Imperative" : null;
    if (aspect) detail.push({ label: "Aspect", value: aspect });
    const mood = valueFor("MOOD:") || features.find(f => ["IND", "SUBJ", "JUS", "ENG"].includes(f));
    if (mood) detail.push({ label: "Mood", value: ({ IND:"Indicative", SUBJ:"Subjunctive", JUS:"Jussive", ENG:"Energetic" } as Record<string,string>)[mood] || mood });
    if (features.includes("PASS")) detail.push({ label: "Voice", value: "Passive" });
    if (features.includes("ACT")) detail.push({ label: "Voice", value: "Active" });
  } else if (kind === "PRON") {
    detail.push({ label: "Part of speech", value: features.includes("SUFFIX") ? "Attached pronoun (suffix)" : "Pronoun" });
  } else {
    detail.push({ label: "Part of speech", value: partOfSpeechLabels[kind] || kind });
    if (features.includes("PREFIX")) detail.push({ label: "Segment", value: "Prefix" });
    if (features.includes("SUFFIX")) detail.push({ label: "Segment", value: "Suffix" });
    const grammaticalCase = features.find(f => ["NOM", "ACC", "GEN"].includes(f));
    if (grammaticalCase) detail.push({ label: "Case", value: featureLabels[grammaticalCase] });
    const state = features.find(f => ["DEF", "INDEF"].includes(f));
    if (state) detail.push({ label: "Definiteness", value: featureLabels[state] });
  }
  if (personCode) {
    detail.push({ label: "Person / gender / number", value: personLabels[personCode] || personCode });
  } else {
    const genderNumber = features.find(f => ["MS", "FS", "MP", "FP", "M", "F", "S", "D", "P"].includes(f));
    if (genderNumber) detail.push({ label: "Gender / number", value: featureLabels[genderNumber] || genderNumber });
  }
  return detail;
}
function normalizedRoot(value: string) {
  return normalizeArabic(value).replace(/\s+/g, "").trim();
}

type Note = { id: string; reference: string; question: string; response: string; created: string };

function refOf(chapter: number, verse: number) { return `${chapter}:${verse}`; }
function storageRead(): Note[] {
  try { return JSON.parse(localStorage.getItem("ccc-quran-notes-v1") || "[]") as Note[]; }
  catch { return []; }
}

export default function QuranResearchPage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [chapter, setChapter] = useState(19);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [edition, setEdition] = useState<TranslationEdition>("en.asad");
  const [translations, setTranslations] = useState<Ayah[]>([]);
  const [gerrans, setGerrans] = useState<GerransMap>({});
  const [translationError, setTranslationError] = useState("");
  const [selected, setSelected] = useState<number[]>([28]);
  const [search, setSearch] = useState("");
  const [morph, setMorph] = useState<Morphology | null>(null);
  const [morphLoading, setMorphLoading] = useState(false);
  const [morphError, setMorphError] = useState("");
  const [wordChoice, setWordChoice] = useState<WordChoice | null>(null);
  const [wordGloss, setWordGloss] = useState("");
  const [wordGlossLoading, setWordGlossLoading] = useState(false);
  const [researchTab, setResearchTab] = useState<"grammar" | "roots" | "ccc" | "notes">("grammar");
  const [rootQuery, setRootQuery] = useState("");
  const [rootMatches, setRootMatches] = useState<RootHit[]>([]);
  const [rootTotal, setRootTotal] = useState<number | null>(null);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalLanguage, setGlobalLanguage] = useState<"arabic" | "english">("arabic");
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalTotal, setGlobalTotal] = useState<number | null>(null);
  const [globalShown, setGlobalShown] = useState(MAX_SEARCH_RESULTS);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const arabicCorpus = useRef<FullSurah[] | null>(null);
  const englishCorpus = useRef<Record<string, FullSurah[]>>({});

  const pendingJump = useRef<{ chapter: number; verse: number } | null>(null);
  const scrollTarget = useRef<string | null>(null);
  const [question, setQuestion] = useState("Analyze the selected verse(s) through coherence, correspondence, and calibration. Distinguish explicit statements from inference. Do not import hadith or biblical chronology as unquestioned premises.");
  const [password, setPassword] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setNotes(storageRead());
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => { if (!r.ok) throw new Error("Surah list unavailable"); return r.json(); })
      .then((j: QuranResponse<Surah[]>) => setSurahs(j.data))
      .catch(() => setStatus("Could not load the surah list. Check network access."));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setAyahs([]); setSelected([]); setAiResponse("");
    fetch(`https://api.alquran.cloud/v1/surah/${chapter}/quran-uthmani`)
      .then((r) => { if (!r.ok) throw new Error("Unable to fetch Arabic text"); return r.json(); })
      .then((j: QuranResponse<{ ayahs: Ayah[] }>) => { if (!cancelled) {
        setAyahs(j.data.ayahs);
        setStatus("");
        if (pendingJump.current?.chapter === chapter) {
          const verse = pendingJump.current.verse;
          if (verse <= j.data.ayahs.length) {
            setSelected([verse]);
            scrollTarget.current = refOf(chapter, verse);
          } else {
            setGlobalError(`Surah ${chapter} has only ${j.data.ayahs.length} verses.`);
          }
          pendingJump.current = null;
        }
      } })
      .catch(() => { if (!cancelled) setStatus("Unable to load Arabic text from the data provider."); });
    return () => { cancelled = true; };
  }, [chapter]);

  useEffect(() => {
    let cancelled = false;
    setTranslations([]);
    setTranslationError("");
    if (edition === "gerrans") {
      fetch("/data/gerrans.json")
        .then(r => { if (!r.ok) throw new Error("Gerrans data not installed yet"); return r.json(); })
        .then((data: GerransMap) => {
          if (!cancelled) {
            if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Gerrans data is not in the expected verse-map format");
            setGerrans(data);
          }
        })
        .catch(() => { if (!cancelled) setTranslationError("Gerrans is available for download from Quranite Reader; the data file still needs to be installed in this website."); });
    } else {
      fetch(`https://api.alquran.cloud/v1/surah/${chapter}/${edition}`)
        .then(r => { if (!r.ok) throw new Error("Translation unavailable"); return r.json(); })
        .then((j: QuranResponse<{ ayahs: Ayah[] }>) => { if (!cancelled) setTranslations(j.data.ayahs); })
        .catch(() => { if (!cancelled) setTranslationError("Translation could not be loaded. Try another edition."); });
    }
    return () => { cancelled = true; };
  }, [chapter, edition]);

  const visible = useMemo(() => {
    const q = search.trim();
    return q ? ayahs.filter(a => a.text.includes(q) || String(a.numberInSurah) === q || refOf(chapter, a.numberInSurah) === q) : ayahs;
  }, [ayahs, search, chapter]);
  useEffect(() => {
    if (!scrollTarget.current) return;
    const id = scrollTarget.current;
    const target = document.getElementById(`ccc-verse-${id.replace(":", "-")}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollTarget.current = null;
    }
  }, [ayahs, search, selected]);

  function goToReference(targetChapter: number, targetVerse: number) {
    const target = refOf(targetChapter, targetVerse);
    setSearch(String(targetVerse));
    scrollTarget.current = target;
    setGlobalResults([]);
    setGlobalTotal(null);
    if (chapter === targetChapter && ayahs.some(a => a.numberInSurah === targetVerse)) {
      setSelected([targetVerse]);
    } else {
      pendingJump.current = { chapter: targetChapter, verse: targetVerse };
      setChapter(targetChapter);
    }
  }

  async function getFullCorpus(editionId: string): Promise<FullSurah[]> {
    const endpoint = `https://api.alquran.cloud/v1/quran/${editionId}`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Cannot load ${editionId} corpus (HTTP ${res.status}).`);
    const payload: QuranResponse<{ surahs: FullSurah[] }> = await res.json();
    if (!Array.isArray(payload?.data?.surahs) || payload.data.surahs.length !== 114) {
      throw new Error(`Invalid or incomplete ${editionId} corpus.`);
    }
    return payload.data.surahs;
  }

  async function searchWholeQuran(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = globalQuery.trim();
    setGlobalError("");
    setGlobalResults([]);
    setGlobalTotal(null);
    setGlobalShown(MAX_SEARCH_RESULTS);
    if (!query) { setGlobalError("Enter a verse reference or keyword to search."); return; }
    // A surah:verse reference navigates directly, without loading the full corpus.
    const reference = query.match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
    if (reference) {
      const targetChapter = Number(reference[1]);
      const targetVerse = Number(reference[2]);
      const surah = surahs.find(s => s.number === targetChapter);
      if (targetChapter < 1 || targetChapter > 114 || targetVerse < 1) {
        setGlobalError("Enter a valid surah (1–114) and verse number.");
        return;
      }
      if (surah && targetVerse > surah.numberOfAyahs) {
        setGlobalError(`Surah ${targetChapter} has only ${surah.numberOfAyahs} verses.`);
        return;
      }
      goToReference(targetChapter, targetVerse);
      return;
    }
    setGlobalLoading(true);
    try {
      if (!arabicCorpus.current) arabicCorpus.current = await getFullCorpus("quran-uthmani");
      let translationVerses: FullSurah[] | null = null;
      let gerransMap: GerransMap | null = null;
      if (globalLanguage === "english") {
        if (edition === "gerrans") {
          if (Object.keys(gerrans).length) gerransMap = gerrans;
          else {
            const res = await fetch("/data/gerrans.json");
            if (!res.ok) throw new Error("Gerrans translation file is missing: public/data/gerrans.json");
            gerransMap = await res.json() as GerransMap;
            setGerrans(gerransMap);
          }
        } else {
          if (!englishCorpus.current[edition]) englishCorpus.current[edition] = await getFullCorpus(edition);
          translationVerses = englishCorpus.current[edition];
        }
      }
      const normalizedQuery = globalLanguage === "arabic" ? normalizeArabic(query) : query.toLocaleLowerCase();
      const hits: SearchResult[] = [];
      for (const surah of arabicCorpus.current) {
        const engSurah = translationVerses?.find(item => item.number === surah.number);
        for (const verse of surah.ayahs) {
          const ref = refOf(surah.number, verse.numberInSurah);
          const english = gerransMap?.[ref] ?? engSurah?.ayahs.find(item => item.numberInSurah === verse.numberInSurah)?.text ?? "";
          const searchable = globalLanguage === "arabic" ? normalizeArabic(verse.text) : english.toLocaleLowerCase();
          if (searchable.includes(normalizedQuery)) {
            hits.push({ chapter: surah.number, verse: verse.numberInSurah, arabic: verse.text, english });
          }
        }
      }
      setGlobalResults(hits);
      setGlobalTotal(hits.length);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Unable to complete corpus search.");
    } finally { setGlobalLoading(false); }
  }

  function openSearchResult(result: SearchResult) {
    setSearch("");
    scrollTarget.current = refOf(result.chapter, result.verse);
    if (chapter === result.chapter && ayahs.some(a => a.numberInSurah === result.verse)) {
      setSelected([result.verse]);
      requestAnimationFrame(() => {
        document.getElementById(`ccc-verse-${result.chapter}-${result.verse}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } else {
      pendingJump.current = { chapter: result.chapter, verse: result.verse };
      setChapter(result.chapter);
    }
  }

  async function loadMorphology(): Promise<Morphology> {
    if (morph) return morph;
    setMorphLoading(true); setMorphError("");
    try {
      const response = await fetch("/data/morphology.json");
      if (!response.ok) throw new Error("Morphology data unavailable. Upload public/data/morphology.json.");
      const data = await response.json() as Morphology;
      if (!data["1:1"] || !data["114:6"]) throw new Error("Incomplete morphology dataset.");
      setMorph(data);
      return data;
    } catch (error) {
      setMorphError(error instanceof Error ? error.message : "Cannot load morphology data.");
      throw error;
    } finally { setMorphLoading(false); }
  }

  async function inspectWord(reference: string, displayIndex: number, display: string, verseText: string) {
    try {
      const dataset = await loadMorphology();
      const corpusWords = dataset[reference];
      if (!corpusWords) { setMorphError(`No morphology data for ${reference}.`); return; }
      const mapping = alignVerseWords(verseText.trim().split(/\s+/), corpusWords);
      const corpusIndex = mapping[displayIndex - 1];
      if (corpusIndex === null || corpusIndex === undefined) {
        setMorphError(`Cannot safely align word ${displayIndex} of ${reference}. No grammar was assigned.`);
        return;
      }
      setMorphError("");
      setWordChoice({ reference, index: corpusIndex, display });
      setResearchTab("grammar");
    } catch { /* loadMorphology displays the error */ }
  }
  async function findRoot(root: string) {
    setResearchTab("roots");
    const requested = normalizedRoot(root);
    setRootMatches([]); setRootTotal(null);
    if (!requested) return;
    try {
      const dataset = await loadMorphology();
      const results: RootHit[] = [];
      for (const [reference, words] of Object.entries(dataset)) {
        words.forEach((w, index) => {
          if (w.r && normalizedRoot(translitToArabic(w.r)) === requested) {
            results.push({ reference, index: index + 1, lemma: w.l });
          }
        });
      }
      setRootTotal(results.length);
      setRootMatches(results.slice(0, 200));
    } catch { /* error already displayed */ }
  }
  function openRootHit(hit: RootHit) {
    const [targetChapter, targetVerse] = hit.reference.split(":").map(Number);
    setWordChoice({ reference: hit.reference, index: hit.index, display: "" });
    openSearchResult({ chapter: targetChapter, verse: targetVerse, arabic: "", english: "" });
  }
  useEffect(() => {
    if (!wordChoice) { setWordGloss(""); return; }
    let cancelled = false;
    setWordGloss("");
    setWordGlossLoading(true);
    const { reference, index } = wordChoice;
    fetch(`/api/quran-word?verse=${encodeURIComponent(reference)}`)
      .then(async response => {
        if (!response.ok) throw new Error("Word meanings unavailable");
        return response.json() as Promise<{ meanings?: string[] }>;
      })
      .then(data => {
        if (!cancelled) setWordGloss(data.meanings?.[index - 1] || "");
      })
      .catch(() => { if (!cancelled) setWordGloss(""); })
      .finally(() => { if (!cancelled) setWordGlossLoading(false); });
    return () => { cancelled = true; };
  }, [wordChoice?.reference, wordChoice?.index]);

  const inspectedWord = wordChoice && morph?.[wordChoice.reference]?.[wordChoice.index - 1];
  const selectedRoot = inspectedWord?.r ? translitToArabic(inspectedWord.r) : "";

  const selectedAyahs = ayahs.filter(a => selected.includes(a.numberInSurah));
  const currentSurah = surahs.find(s => s.number === chapter);
  function toggleAyah(n: number) { setSelected(old => old.includes(n) ? old.filter(v => v !== n) : [...old, n].sort((a,b) => a-b)); }
  async function analyze() {
    if (!selectedAyahs.length) { setStatus("Select at least one verse first."); return; }
    setLoading(true); setStatus(""); setAiResponse("");
    try {
      const response = await fetch("/api/ccc-ai", {
        method: "POST", headers: { "Content-Type": "application/json", "x-ccc-passcode": password },
        body: JSON.stringify({ question, chapter, verses: selectedAyahs.map(a => ({ verse: a.numberInSurah, arabic: a.text })) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Research service unavailable");
      setAiResponse(json.answer || "No response returned.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unexpected problem"); }
    finally { setLoading(false); }
  }
  function saveNote() {
    if (!selectedAyahs.length) { setStatus("Select a verse before saving a note."); return; }
    const entry: Note = {
      id: `${Date.now()}`, reference: selectedAyahs.map(a => refOf(chapter, a.numberInSurah)).join(", "),
      question, response: aiResponse || "No AI analysis saved; question only.", created: new Date().toISOString(),
    };
    const next = [entry, ...notes]; setNotes(next); localStorage.setItem("ccc-quran-notes-v1", JSON.stringify(next));
    setStatus("Saved in this browser. Export notes before clearing browser data.");
  }
  function exportNotes() {
    const file = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(file); const a = document.createElement("a");
    a.href = href; a.download = "ccc-quran-research-notes.json"; a.click(); URL.revokeObjectURL(href);
  }
  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div><a href="/" className={styles.back}>← CCC Framework</a><h1>Qurʾān Research Engine</h1><p>Arabic text · verse selection · CCC analysis · research notes</p></div>
        <span className={styles.beta}>Research prototype</span>
      </div>
      <section className={styles.globalSearch} aria-label="Search the entire Quran">
        <h2>Find a verse or search the Qurʾān</h2>
        <p className={styles.hint}>Enter a reference such as 19:28 to jump directly to that verse, or search all 114 surahs by Arabic text or your selected English translation. Keyword searches are not root searches.</p>
        <form onSubmit={searchWholeQuran} className={styles.globalSearchForm}>
          <input aria-label="Quran-wide search keyword" value={globalQuery} onChange={e => setGlobalQuery(e.target.value)} placeholder={globalLanguage === "arabic" ? "19:28 or Arabic word (e.g. مريم)" : "19:28 or English word (e.g. mercy)"} />
          <select aria-label="Search language" value={globalLanguage} onChange={e => setGlobalLanguage(e.target.value as "arabic" | "english")}>
            <option value="arabic">Arabic</option><option value="english">English (selected translation)</option>
          </select>
          <button type="submit" disabled={globalLoading}>{globalLoading ? "Searching…" : "Go / Search"}</button>
        </form>
        {globalError && <p role="alert" className={styles.searchError}>{globalError}</p>}
        {globalTotal !== null && <p role="status" className={styles.searchCount}>{globalTotal} matching verses{globalLanguage === "english" ? ` · ${editions.find(e => e.id === edition)?.name || edition}` : ""}</p>}
        {globalTotal === 0 && <p className={styles.hint}>No exact keyword matches. Try a shorter word or another spelling.</p>}
        {globalResults.length > 0 && <div className={styles.searchResults}>
          {globalResults.slice(0, globalShown).map(result => <button type="button" className={styles.searchHit} key={`${result.chapter}:${result.verse}`} onClick={() => openSearchResult(result)}>
            <strong>{refOf(result.chapter, result.verse)}</strong>
            {globalLanguage === "arabic" ? <span dir="rtl" lang="ar" className={styles.hitArabic}>{result.arabic}</span> : <span className={styles.hitEnglish}>{result.english}</span>}
          </button>)}
          {globalTotal !== null && globalShown < globalTotal && <button className={styles.moreResults} type="button" onClick={() => setGlobalShown(n => n + MAX_SEARCH_RESULTS)}>Show 100 more ({globalTotal - globalShown} remaining)</button>}
        </div>}
      </section>
      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Quran reader">
          <div className={styles.panelHeader}><h2>Qurʾān reader</h2><span>{ayahs.length} verses</span></div>
          <div className={styles.controls}>
            <label>Surah
              <select value={chapter} onChange={e => setChapter(Number(e.target.value))}>
                {surahs.length ? surahs.map(s => <option value={s.number} key={s.number}>{s.number}. {s.englishName}</option>) : <option value={19}>19. Maryam</option>}
              </select>
            </label>
            <label>Find within surah
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Arabic text or verse number" />
            </label>
          </div>
          <div className={styles.translationControl}>
            <label htmlFor="ccc-translation">English translation</label>
            <select id="ccc-translation" value={edition} onChange={e => setEdition(e.target.value as TranslationEdition)}>
              {editions.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            {translationError && <p className={styles.translationNotice}>{translationError}</p>}
          </div>
          <p className={styles.hint}>Select one or more verses to send their exact Arabic text to the CCC panel. {currentSurah?.englishName || ""}</p>
          <div className={styles.verses}>
            {visible.map(a => <div id={`ccc-verse-${chapter}-${a.numberInSurah}`} key={a.numberInSurah}
              className={`${styles.ayah} ${selected.includes(a.numberInSurah) ? styles.chosen : ""}`}>
              <div className={styles.verseToolbar}><span className={styles.ref}>{refOf(chapter, a.numberInSurah)}</span><button type="button" className={styles.verseSelect} onClick={() => toggleAyah(a.numberInSurah)} aria-pressed={selected.includes(a.numberInSurah)}>{selected.includes(a.numberInSurah) ? "Selected for CCC ✓" : "Select for CCC"}</button></div>
              <span className={styles.arabic} dir="rtl" lang="ar">{(() => {
                const reference = refOf(chapter, a.numberInSurah);
                const tokens = a.text.trim().split(/\s+/);
                const mapping = morph?.[reference] ? alignVerseWords(tokens, morph[reference]) : null;
                return tokens.map((token, i) => {
                  // Before annotations load, clicks trigger loading and a verified recheck.
                  const safe = !mapping || mapping[i] !== null;
                  return <button key={i} type="button" className={styles.arabicWord}
                    disabled={!safe}
                    title={safe ? `Inspect word ${i + 1}` : "Word could not be aligned confidently; grammar withheld"}
                    onClick={() => void inspectWord(reference, i + 1, token, a.text)}>{token}</button>;
                });
              })()}</span>
              <span className={styles.english} lang="en">
                {edition === "gerrans"
                  ? (gerrans[refOf(chapter, a.numberInSurah)] || "Gerrans translation not installed for this verse.")
                  : (translations.find(t => t.numberInSurah === a.numberInSurah)?.text || (translationError || "Loading translation…"))}
              </span>
            </div>)}
            {ayahs.length === 0 && <p className={styles.hint}>Loading the Arabic Qurʾān…</p>}
            {ayahs.length > 0 && visible.length === 0 && <p className={styles.hint}>No matches in this surah.</p>}
          </div>
          <p className={styles.credit}>Arabic text supplied by <a href="https://alquran.cloud/api" target="_blank" rel="noreferrer">Al Quran Cloud API</a> (Uthmani edition). Verify the provider's text edition, accuracy, and rights before public production use. This prototype does not modify the returned Arabic text. English renderings are supplied by their respective translators and are not treated as authoritative Arabic text.</p>
        </section>
        <aside className={`${styles.sidebar} ${styles.researchSide}`} aria-label="Research tools">
          <section className={`${styles.panel} ${styles.researchPanel}`}>
            <div className={styles.panelHeader}><h2>Research tools</h2><span>{selectedAyahs.length} selected for CCC</span></div>
            <div role="tablist" aria-label="Research tools" className={styles.researchTabs}>
              {([['grammar', 'Grammar'], ['roots', 'Roots'], ['ccc', 'CCC'], ['notes', 'Notes']] as const).map(([id, label]) => (
                <button key={id} type="button" role="tab" id={`ccc-tab-${id}`} aria-selected={researchTab === id}
                  aria-controls="ccc-research-content" onClick={() => setResearchTab(id)}
                  className={researchTab === id ? styles.activeResearchTab : ''}>{label}</button>
              ))}
            </div>
            <div className={styles.researchContent} role="tabpanel" id="ccc-research-content" aria-labelledby={`ccc-tab-${researchTab}`}>
              {researchTab === 'grammar' && <div className={styles.tabBody}>
                <h3 className={styles.toolTitle}>Word inspector</h3>
            {morphError && <p role="alert" className={styles.searchError}>{morphError}</p>}
            {wordChoice && <div className={styles.wordInspector}>
              <strong>Word {wordChoice.reference}:{wordChoice.index}</strong>
              <span dir="rtl" lang="ar" className={styles.inspectorArabic}>{wordChoice.display}</span>
              <div className={styles.wordMeaning} lang="en" aria-live="polite">
                <span className={styles.morphLabel}>English word meaning</span>
                <strong>{wordGlossLoading ? "Loading…" : wordGloss || "Unavailable from the word-by-word source"}</strong>
                <small>Contextual gloss, not an exhaustive lexical definition.</small>
              </div>
              {inspectedWord ? <>
                <div className={styles.morphFacts}>
                  <div><span className={styles.morphLabel}>Root</span><strong dir="rtl" lang="ar" className={styles.morphArabicValue}>{selectedRoot || "Not annotated"}</strong></div>
                </div>
                <div className={styles.morphSegments}>
                  <span className={styles.morphLabel}>Grammatical analysis</span>
                  {inspectedWord.s.map((segment, ix) => (
                    <div key={ix} className={styles.grammarGroup}>
                      <div className={styles.grammarHeading}>
                        <span>{segment[1] === "V" ? "Verb stem" : segment[1] === "PRON" ? "Pronoun" : partOfSpeechLabels[segment[1]] || "Word segment"}</span>
                        <span dir="rtl" lang="ar" className={styles.grammarArabic}>{translitToArabic(segment[0])}</span>
                      </div>
                      <dl className={styles.grammarGrid}>
                        {describeSegment(segment).map((detail, j) => (
                          <div key={j} className={styles.grammarField}>
                            <dt>{detail.label}</dt><dd>{detail.value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ))}
                  <p className={styles.grammarNote}>These are corpus annotations. Perfect/imperfect describe grammatical aspect, not necessarily the real-world time of an event.</p>
                </div>

                {selectedRoot && <button type="button" className={styles.rootLink} onClick={() => {setRootQuery(selectedRoot); void findRoot(selectedRoot);}}>Find all occurrences of {selectedRoot}</button>}
              </> : <p className={styles.hint}>{morphLoading ? "Loading annotations…" : "No annotation available at this reference."}</p>}
            </div>}

            {!wordChoice && <p className={styles.emptyTool}>Click any enabled Arabic word in the reader to inspect its root and grammatical details.</p>}
            <p className={styles.morphCredit}>Morphological annotations: <a href="https://corpus.quran.com" target="_blank" rel="noreferrer">Qurʾānic Arabic Corpus</a> v0.4, © Kais Dukes (2011). <a href="/data/quranic-corpus-morphology-0.4.zip">Original unmodified dataset and notices</a>. Annotation is analytical data, not Qurʾānic revelation.</p>
              </div>}
              {researchTab === 'roots' && <div className={styles.tabBody}>
                <h3 className={styles.toolTitle}>Root concordance</h3>
            <div className={styles.toolIntro}>Corpus-assigned root search. Results remain visible while you navigate to verses.</div>
            <form className={styles.rootForm} onSubmit={(event) => {event.preventDefault(); void findRoot(rootQuery);}}>
              <input aria-label="Search Arabic root" value={rootQuery} onChange={e => setRootQuery(e.target.value)} placeholder="Arabic root, e.g. ر ح م" />
              <button type="submit" disabled={morphLoading}>{morphLoading ? "Loading…" : "Find root"}</button>
            </form>
            {morphError && <p role="alert" className={styles.searchError}>{morphError}</p>}
            {rootTotal !== null && <div className={styles.rootHits}>
              <p className={styles.searchCount}>{rootTotal} annotated word occurrences {rootTotal > 200 ? "(first 200 listed)" : ""}</p>
              {rootMatches.map(hit => <button type="button" key={`${hit.reference}:${hit.index}`} onClick={() => openRootHit(hit)}><strong>{hit.reference}</strong><span>Word {hit.index}</span><span dir="rtl" lang="ar" className={styles.hitLemma}>{hit.lemma ? translitToArabic(hit.lemma) : "—"}</span></button>)}
            </div>}
            {rootTotal === 0 && <p role="status" className={styles.hint}>No annotated occurrences found for this root.</p>}
            <p className={styles.morphCredit}>Morphological annotations: <a href="https://corpus.quran.com" target="_blank" rel="noreferrer">Qurʾānic Arabic Corpus</a> v0.4, © Kais Dukes (2011). <a href="/data/quranic-corpus-morphology-0.4.zip">Original unmodified dataset and notices</a>. Annotation is analytical data, not Qurʾānic revelation.</p>
              </div>}
              {researchTab === 'ccc' && <>
          <div className={styles.tabBody}>
            <div className={styles.panelHeader}><h2>CCC research assistant</h2><span>{selectedAyahs.length} selected</span></div>
            <div className={styles.selection}>{selectedAyahs.length ? selectedAyahs.map(a => <span key={a.numberInSurah}>{refOf(chapter, a.numberInSurah)}</span>) : "Choose a verse on the left"}</div>
            <label className={styles.label}>Research question
              <textarea rows={6} value={question} onChange={e => setQuestion(e.target.value)} />
            </label>
            <label className={styles.label}>Private research passcode
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Set by site administrator" />
            </label>
            <button type="button" className={styles.primary} disabled={loading || !selectedAyahs.length} onClick={analyze}>{loading ? "Analyzing…" : "Analyze with CCC"}</button>
            {status && <p role="status" className={styles.status}>{status}</p>}
            {aiResponse && <div className={styles.answer}><h3>Research response</h3><pre>{aiResponse}</pre></div>}
            <button type="button" className={styles.secondary} onClick={saveNote}>Save research note</button>
            <p className={styles.hint}>Research output may be mistaken. Only the selected verses are sent to AI; pan-textual completeness is not yet automated.</p>
          </div>
              </>}
              {researchTab === 'notes' && <>
          <div className={styles.tabBody}>
            <div className={styles.panelHeader}><h2>Research notebook</h2><button type="button" className={styles.small} onClick={exportNotes} disabled={!notes.length}>Export JSON</button></div>
            {!notes.length ? <p className={styles.hint}>No saved notes yet. Notes stay in this browser until exported.</p> : notes.slice(0, 12).map(n => <details key={n.id} className={styles.note}><summary>{n.reference} · {new Date(n.created).toLocaleDateString()}</summary><p>{n.question}</p><pre>{n.response}</pre></details>)}
          </div>
              </>}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
