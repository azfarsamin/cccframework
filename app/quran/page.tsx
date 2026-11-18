"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ResearchMarkdown } from "./research-markdown";
import { decorateRenderedVerseReferences, parseReaderCitationHash } from "./analysis-verse-links";
import { VerseReferences } from "./verse-references";
import styles from "./quran.module.css";
import { corpusEncodingToArabic } from "../../lib/corpus-readable";
import audioStyles from "./verse-audio.module.css";
import creditsStyles from "./credits-popup.module.css";
import { VerseAudioButton, VerseAudioDock, useQuranVerseAudio } from "./verse-audio";

// The model occasionally emits numeric HTML entities and malformed section numbering.
// Decode numeric character references as plain text; React/ResearchMarkdown still
// controls rendering (never inject the output as HTML).
function cleanAnalysisText(source: string): string {
  return source.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (full, encoded: string) => {
    const hex = encoded[0].toLowerCase() === "x";
    const value = Number.parseInt(hex ? encoded.slice(1) : encoded, hex ? 16 : 10);
    return Number.isInteger(value) && value > 0 && value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff)
      ? String.fromCodePoint(value) : full;
  }).replace(/&(?:amp|lt|gt|quot|apos);/g, entity =>
    ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '\"', "&apos;": "'" } as Record<string, string>)[entity] || entity);
}


// Decorate the *rendered* analysis, rather than inserting Markdown syntax that
// ResearchMarkdown prints literally. Render completed text only; streaming
// stays untouched to avoid interfering with React updates during generation.
function LinkedResearchAnalysis({ source, enabled = true }: { source: string; enabled?: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (enabled && contentRef.current) decorateRenderedVerseReferences(contentRef.current);
  }, [source, enabled]);
  return <div ref={contentRef}><ResearchMarkdown source={source}/></div>;
}

// Copy the source text as displayed, with a citation on the final line.
// "Verse" produces the bilingual/trilingual block the researcher can paste directly:
// Arabic, selected translation (English or Urdu), then (surah:verse).
// The individual Arabic/translation actions remain available, and also cite the verse.
function formatVerseForCopy(reference: string, arabic: string, translation?: string): string {
  return [arabic.trim(), translation?.trim(), `(${reference})`].filter(Boolean).join("\n");
}
function VerseCopyControls({ reference, arabic, translation, urdu }: {
  reference: string; arabic: string; translation: string; urdu: boolean;
}) {
  const [feedback, setFeedback] = useState("");
  async function copyText(text: string, name: string) {
    if (!text.trim() || !navigator.clipboard?.writeText) {
      setFeedback("Clipboard access unavailable. Use HTTPS or your browser's copy command.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${name} copied with reference`);
    } catch {
      setFeedback("Unable to copy. Check browser clipboard permissions.");
    }
  }
  function copyButton(kind: "arabic" | "translation", value: string) {
    const name = kind === "arabic" ? "Arabic" : urdu ? "Urdu" : "English";
    return <button type="button" disabled={!value.trim()}
      className={creditsStyles.verseCopyButton}
      title={`Copy ${name} with verse reference (${reference})`}
      aria-label={`Copy ${name} text of verse ${reference} with reference`}
      onClick={() => void copyText(formatVerseForCopy(reference, value), name)}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="8" width="12" height="12" rx="2"/>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
      </svg>
      <span className={creditsStyles.verseCopyLabel}>{name}</span>
    </button>;
  }
  return <div className={creditsStyles.verseCopyFooter}>
    <div className={creditsStyles.verseCopyLeft}>
      {copyButton("arabic", arabic)}
      {urdu && copyButton("translation", translation)}
    </div>
    <button type="button" className={creditsStyles.verseCopyButton}
      disabled={!arabic.trim() || !translation.trim()}
      title={`Copy Arabic and ${urdu ? "Urdu" : "English"} with verse reference (${reference})`}
      aria-label={`Copy complete verse ${reference}: Arabic, ${urdu ? "Urdu" : "English"}, and reference`}
      onClick={() => void copyText(formatVerseForCopy(reference, arabic, translation), "Both")}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="8" y="8" width="12" height="12" rx="2"/>
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>
      </svg>
      <span className={creditsStyles.verseCopyLabel}>Both</span>
    </button>
    {!urdu && copyButton("translation", translation)}
    <span className={creditsStyles.verseCopyFeedback} role="status" aria-live="polite">{feedback}</span>
  </div>;
}

type Surah = { number: number; name: string; englishName: string; numberOfAyahs: number };
type Ayah = { numberInSurah: number; text: string };
type QuranResponse<T> = { code: number; data: T };
type TranslationEdition = "en.asad" | "en.sahih" | "en.yusufali" | "en.pickthall" | "en.itani" | "gerrans" | "ur.islahi";
const editions: { id: TranslationEdition; name: string }[] = [
  { id: "en.asad", name: "Muhammad Asad" },
  { id: "en.sahih", name: "Saheeh International" },
  { id: "en.yusufali", name: "Abdullah Yusuf Ali" },
  { id: "en.pickthall", name: "Marmaduke Pickthall" },
  { id: "en.itani", name: "Talal Itani" },
  { id: "gerrans", name: "Sam Gerrans" },
  { id: "ur.islahi", name: "Amin Ahsan Islahi — Urdu (all 114 surahs)" },
];
type GerransMap = Record<string, string>;
type IslahiQuran = {
  title: string;
  translator: string;
  source: string;
  total_surahs: number;
  total_verses: number;
  surahs: {
    surah_number: number;
    total_verses: number;
    verses: { surah: number; ayah: number; arabic: string; translation_ur: string }[];
  }[];
};
// One shared, cached download for the entire 114-surah Urdu translation.
// Its Arabic field is not substituted for the separate Reader Arabic edition.
let islahiPromise: Promise<GerransMap> | null = null;
async function loadIslahiQuran(): Promise<GerransMap> {
  if (!islahiPromise) islahiPromise = (async () => {
    const response = await fetch("/data/quran_translation_amin_ahsan_islahi.json");
    if (!response.ok) throw new Error(`Islahi Urdu data unavailable (HTTP ${response.status})`);
    const data = await response.json() as IslahiQuran;
    if (data?.total_surahs !== 114 || data?.total_verses !== 6236 ||
        !Array.isArray(data.surahs) || data.surahs.length !== 114 ||
        data.translator !== "Amin Ahsan Islahi") {
      throw new Error("Invalid full-Qurʾān Islahi translation metadata");
    }
    const result: GerransMap = {};
    let total = 0;
    for (let i = 0; i < 114; i++) {
      const surah = data.surahs[i];
      if (surah?.surah_number !== i + 1 || !Array.isArray(surah.verses) ||
          surah.verses.length !== surah.total_verses) throw new Error(`Invalid Urdu Surah ${i+1} record`);
      for (let j = 0; j < surah.verses.length; j++) {
        const verse = surah.verses[j];
        if (verse.surah !== i + 1 || verse.ayah !== j + 1 ||
            typeof verse.translation_ur !== "string" || !verse.translation_ur.trim()) {
          throw new Error(`Invalid Urdu verse ${i+1}:${j+1}`);
        }
        result[`${i+1}:${j+1}`] = verse.translation_ur;
        total++;
      }
    }
    if (total !== 6236 || Object.keys(result).length !== 6236) throw new Error("Urdu verse map incomplete");
    return result;
  })().catch(error => { islahiPromise = null; throw error; });
  return islahiPromise;
}

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


// Some Arabic providers prefix the basmalah to verse 1 outside al-Fatihah.
// Separate it only for display; preserve the original verse text for searches,
// selected research evidence and grammatical word alignment.
function verseBasmalahOffset(chapter: number, verse: number, tokens: string[]): number {
  if (chapter === 1 || chapter === 9 || verse !== 1 || tokens.length <= 4) return 0;
  const expected = ["بسم", "الله", "الرحمن", "الرحيم"];
  return expected.every((word, index) => normalizeArabic(tokens[index]) === word) ? 4 : 0;
}

type MorphSegment = [string, string, string];
type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
type Morphology = Record<string, MorphWord[]>;
type WordChoice = { reference: string; index: number; display: string };
type RootHit = {
  reference: string;
  index: number;
  surface: string;
  morphology: string;
  group: string;
  lemma: string;
  romanized: string;
  context?: { before: string[]; match: string; after: string[] };
};

// Match displayed Arabic words to corpus word positions, never by raw index alone.
// Orthographic normalization is used for matching only; it never changes the source text.
function wordKey(value: string): string {
  // The displayed Uthmani text may retain hamza as an independent letter
  // (e.g. ٱلشُّهَدَآءَ), whereas the segmented Buckwalter surface can omit it.
  // Compare orthographic skeletons symmetrically; preserve the original forms
  // for display and keep the order/occurrence safeguards in alignVerseWords.
  return normalizeArabic(value)
    .replace(/\u0671/g, "ا")
    .replace(/\u06E5/g, "و")
    .replace(/\u06E6/g, "ي")
    .replace(/ء/g, "")
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
// Retain the corpus's classification: participles are noun stems tagged PCPL.
function rootGrammaticalGroup(word: MorphWord): string {
  const stem = word.s.find(segment => segment[2].split("|").includes("STEM")) || word.s.find(segment => !["DET", "CONJ", "P"].includes(segment[1])) || word.s[0];
  if (!stem) return "Other annotated forms";
  const tags = stem[2].split("|");
  if (tags.includes("PCPL")) {
    if (tags.includes("PASS")) return "Passive participle";
    if (tags.includes("ACT")) return "Active participle";
    return "Participle (voice unspecified)";
  }
  if (stem[1] === "V") {
    const form = stem[2].match(/\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)/)?.[1] || "I";
    return `Verb — Form ${form}`;
  }
  if (stem[1] === "N") return "Noun";
  if (stem[1] === "ADJ") return "Adjective";
  if (stem[1] === "PN") return "Proper noun";
  return partOfSpeechLabels[stem[1]] || "Other annotated forms";
}

// Transliteration is display assistance, not a translation or grammatical source.
function corpusRomanization(value: string): string {
  const letters: Record<string, string> = {
    A:"ā", b:"b", t:"t", v:"th", j:"j", H:"ḥ", x:"kh", d:"d", '*':"dh",
    r:"r", z:"z", s:"s", '$':"sh", S:"ṣ", D:"ḍ", T:"ṭ", Z:"ẓ", E:"ʿ",
    g:"gh", f:"f", q:"q", k:"k", l:"l", m:"m", n:"n", h:"h", w:"w",
    y:"y", '<':"ʾi", '>':"ʾa", '&':"ʾ", '}':"ʾ", p:"h", Y:"ā",
    '|':"ʾā", '{':"a", X:"kh", a:"a", i:"i", u:"u", F:"an", N:"un", K:"in",
    '`':"ā", '^':"", o:""
  };
  let output = "";
  for (const character of value) {
    if (character === "~") {
      // Display shadda by doubling the preceding Latin segment where practical.
      const last = Array.from(output).pop();
      if (last) output += last;
      continue;
    }
    // The original corpus uses non-phonetic Quranic stop and orthographic
    // signs. Never expose raw source symbols as alleged Latin transliteration.
    output += letters[character] ?? (/[\[\],.#;:%!+_@\-\"' ]/.test(character) ? "" : corpusEncodingToArabic(character));
  }
  return output;
}

// Render a readable whole-word transliteration from the existing corpus segments.
// The definite article is joined to its preceding prefix (bi + al -> bil-),
// while a sun-letter shadda after the article is not printed twice. The
// separate stem-internal shadda (e.g. rr in sharri) is retained.
function inspectorTransliteration(word: MorphWord): string {
  let output = "";
  let articleBeforeStem = false;
  for (const [surface, kind] of word.s) {
    if (kind === "DET") {
      output += output && /[aeiouāīū]$/i.test(output) ? "l-" : "al-";
      articleBeforeStem = true;
      continue;
    }
    // Extended orthographic suffix w^A@ is the final written waw/alif
    // of a 3MP perfect verb. It must not appear as "w^A@" or yield an
    // extra romanized "wā" after the already vocalized verb stem.
    if (kind === "PRON" && /^w\^?A@?$/.test(surface) && /u$/.test(output)) {
      output = output.slice(0, -1) + "ū";
      articleBeforeStem = false;
      continue;
    }
    const adjusted = articleBeforeStem && surface.length > 1 && surface[1] === "~"
      ? surface[0] + surface.slice(2) : surface;
    output += corpusRomanization(adjusted);
    articleBeforeStem = false;
  }
  return output;
}

const ROOT_GROUP_ORDER = [
  "Verb — Form I", "Verb — Form II", "Verb — Form III", "Verb — Form IV",
  "Verb — Form V", "Verb — Form VI", "Verb — Form VII", "Verb — Form VIII",
  "Verb — Form IX", "Verb — Form X", "Verb — Form XI", "Verb — Form XII",
  "Noun", "Active participle", "Passive participle", "Participle (voice unspecified)",
  "Adjective", "Proper noun", "Other annotated forms"
];

function normalizedRoot(value: string) {
  return normalizeArabic(value).replace(/\s+/g, "").trim();
}

type SavedDraft = {
  reference: string;
  content: string;
  updatedAt: string;
  evidenceAudit?: unknown;
  argumentAudit?: unknown;
  auditReport?: unknown;
  unsuppliedReferences?: string[];
};
const DRAFT_STORAGE_KEY = "ccc-quran-publication-drafts-v1";
function refOf(chapter: number, verse: number) { return `${chapter}:${verse}`; }
function readSavedDrafts(): SavedDraft[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DRAFT_STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedDraft =>
      Boolean(item && typeof item === "object" &&
        typeof item.reference === "string" && /^\d{1,3}:\d{1,3}$/.test(item.reference) &&
        typeof item.content === "string" && typeof item.updatedAt === "string"));
  } catch { return []; }
}

export function QuranResearchPage({ publicMode = false }: { publicMode?: boolean } = {}) {
  // Remove the host site's marketing/navigation bar in the public workspace.
  // The parent site layout is not part of this upload-only package, so locate
  // the actual bar by its VISIBLE menu links, not brittle href paths/classes.
  // Never touch the private /quran workspace or any element containing it.
  useEffect(() => {
    if (!publicMode) return;
    const root = document.getElementById("ccc-public-research");
    if (!root) return;
    const marked = new Set<HTMLElement>();
    const menuLabels = new Set(["home", "books", "articles", "publications", "contact"]);
    const hideSiteNavigation = () => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a"))
        .filter(a => !root.contains(a) && menuLabels.has((a.textContent || "").trim().toLowerCase()));
      if (links.length < 3) return;
      const starts = links.filter(a => (a.textContent || "").trim().toLowerCase() === "books");
      for (const start of starts) {
        let candidate: HTMLElement | null = start.parentElement;
        while (candidate && candidate !== document.body && !candidate.contains(root)) {
          const labels = new Set(Array.from(candidate.querySelectorAll("a"))
            .map(a => (a.textContent || "").trim().toLowerCase()));
          const count = [...menuLabels].filter(label => labels.has(label)).length;
          if (count >= 4) break;
          candidate = candidate.parentElement;
        }
        if (!candidate || candidate === document.body || candidate.contains(root)) continue;
        const semanticHeader = candidate.closest<HTMLElement>("header, [role='banner']");
        let container = semanticHeader && !semanticHeader.contains(root) ? semanticHeader : candidate;
        // Include the site logo when the navigation and branding share a wrapper.
        if (container === candidate && !/CCC Framework/i.test(container.textContent || "")) {
          let ancestor = container.parentElement;
          while (ancestor && ancestor !== document.body && !ancestor.contains(root)) {
            if (/CCC Framework/i.test(ancestor.textContent || "")) {
              container = ancestor;
              break;
            }
            ancestor = ancestor.parentElement;
          }
        }
        container.setAttribute("data-ccc-public-hide-header", "true");
        marked.add(container);
        break;
      }
    };
    hideSiteNavigation();
    // Handle delayed/header hydration without affecting other routes.
    const observer = new MutationObserver(hideSiteNavigation);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      marked.forEach(el => el.removeAttribute("data-ccc-public-hide-header"));
    };
  }, [publicMode]);
  // Display attribution once per browser, then retain a permanent way to reopen it.
  const [creditsOpen, setCreditsOpen] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem("ccc-reader-credits-ack-v1") !== "1") setCreditsOpen(true); }
    catch { setCreditsOpen(true); }
  }, []);
  const closeCredits = () => {
    setCreditsOpen(false);
    try { localStorage.setItem("ccc-reader-credits-ack-v1", "1"); } catch { /* private browsing */ }
  };
  useEffect(() => {
    if (!creditsOpen) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeCredits(); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [creditsOpen]);
  const [surahs, setSurahs] = useState<Surah[]>([]);
  // One shared recorded-audio player; entirely independent of verse selection and AI.
  const verseAudio = useQuranVerseAudio(surahs);
  // Keep the player mounted when collapsed so recitation never stops on toggle.
  const [recitationExpanded, setRecitationExpanded] = useState(false);
  const [chapter, setChapter] = useState(1);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [edition, setEdition] = useState<TranslationEdition>("gerrans");
  const [translations, setTranslations] = useState<Ayah[]>([]);
  const [gerrans, setGerrans] = useState<GerransMap>({});
  const [islahi, setIslahi] = useState<GerransMap>({});
  const [translationError, setTranslationError] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [selectedSearch, setSelectedSearch] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [search, setSearch] = useState("");
  const [morph, setMorph] = useState<Morphology | null>(null);
  const [morphLoading, setMorphLoading] = useState(false);
  const [morphError, setMorphError] = useState("");
  const [wordChoice, setWordChoice] = useState<WordChoice | null>(null);
  const [wordGloss, setWordGloss] = useState("");
  const [wordGlossLoading, setWordGlossLoading] = useState(false);
  const [researchTab, setResearchTab] = useState<"grammar" | "roots" | "analysis">("grammar");
  const [researchExpanded, setResearchExpanded] = useState(false);
  // Desktop workspace split, independent of verse selection and streaming.
  // A wider pane preserves context without resetting an in-progress analysis.
  const [readerWidth, setReaderWidth] = useState(55);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("ccc-quran-reader-pane-width-v1"));
      if (Number.isFinite(saved) && saved >= 35 && saved <= 70) setReaderWidth(saved);
    } catch { /* local storage can be disabled */ }
  }, []);
  function updateReaderWidth(width: number) {
    const safe = Math.min(70, Math.max(35, Math.round(width / 5) * 5));
    setReaderWidth(safe);
    setResearchExpanded(false);
    try { localStorage.setItem("ccc-quran-reader-pane-width-v1", String(safe)); }
    catch { /* layout control still works without persistence */ }
  }

  const analysisAbort = useRef<AbortController | null>(null);
  const analysisRun = useRef(0);
  const [rootQuery, setRootQuery] = useState("");
  const [rootInitial, setRootInitial] = useState("");
  const [rootMatches, setRootMatches] = useState<RootHit[]>([]);
  const [rootTotal, setRootTotal] = useState<number | null>(null);
  const [rootGroupShown, setRootGroupShown] = useState<Record<string, number>>({});
  // The word inspector already retrieves the corpus-backed word-by-word gloss
  // from /api/quran-word. Reuse that authoritative per-verse source in the Roots
  // concordance; never invent a meaning from the Arabic root.
  const rootGlossCache = useRef(new Map<string, string[] | null>());
  const rootGlossPending = useRef(new Set<string>());
  const [rootGlossRevision, setRootGlossRevision] = useState(0);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalLanguage, setGlobalLanguage] = useState<"arabic" | "english">("arabic");
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalTotal, setGlobalTotal] = useState<number | null>(null);
  const [globalShown, setGlobalShown] = useState(MAX_SEARCH_RESULTS);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const arabicCorpus = useRef<FullSurah[] | null>(null);
  const englishCorpus = useRef<Record<string, FullSurah[]>>({});

  // The dropdown is generated from the corpus itself, not a hand-maintained list.
  const rootOptions = useMemo(() => {
    if (!morph) return [] as { root: string; count: number }[];
    const counts = new Map<string, number>();
    for (const words of Object.values(morph)) {
      for (const word of words) {
        if (!word.r) continue;
        const root = normalizedRoot(translitToArabic(word.r));
        if (root) counts.set(root, (counts.get(root) || 0) + 1);
      }
    }
    const collator = new Intl.Collator("ar");
    return Array.from(counts, ([root, count]) => ({ root, count }))
      .sort((a, b) => collator.compare(a.root, b.root));
  }, [morph]);

  // Group exactly the retrieved occurrences; no word is duplicated across headings.
  const rootGroups = useMemo(() => {
    const grouped = new Map<string, RootHit[]>();
    for (const hit of rootMatches) {
      const entries = grouped.get(hit.group) || [];
      entries.push(hit);
      grouped.set(hit.group, entries);
    }
    return Array.from(grouped, ([name, hits]) => ({ name, hits }))
      .sort((a, b) => {
        const aRank = ROOT_GROUP_ORDER.indexOf(a.name);
        const bRank = ROOT_GROUP_ORDER.indexOf(b.name);
        if (aRank !== bRank) return (aRank < 0 ? 999 : aRank) - (bRank < 0 ? 999 : bRank);
        return a.name.localeCompare(b.name);
      });
  }, [rootMatches]);

  // Load English word glosses only for rows currently shown in Roots. Each
  // request returns all word meanings for one verse, so adjacent occurrences
  // share a cached response. Concurrency stays bounded on large root searches.
  useEffect(() => {
    if (researchTab !== "roots" || !rootGroups.length) return;
    const visibleRefs = Array.from(new Set(rootGroups.flatMap(group =>
      group.hits.slice(0, rootGroupShown[group.name] ?? 50).map(hit => hit.reference)
    ))).filter(ref => !rootGlossCache.current.has(ref) && !rootGlossPending.current.has(ref));
    if (!visibleRefs.length) return;
    for (const ref of visibleRefs) rootGlossPending.current.add(ref);
    let cursor = 0;
    async function loadNext() {
      while (cursor < visibleRefs.length) {
        const ref = visibleRefs[cursor++];
        try {
          const response = await fetch(`/api/quran-word?verse=${encodeURIComponent(ref)}`);
          if (!response.ok) throw new Error(`Gloss unavailable for ${ref}`);
          const data = await response.json() as { meanings?: string[] };
          rootGlossCache.current.set(ref, Array.isArray(data.meanings) ? data.meanings : null);
        } catch {
          rootGlossCache.current.set(ref, null); // Show unavailable, not a guessed gloss.
        } finally {
          rootGlossPending.current.delete(ref);
          setRootGlossRevision(value => value + 1);
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(4, visibleRefs.length) }, () => loadNext()));
  }, [researchTab, rootGroups, rootGroupShown]);

  // First-letter categories are generated from the same morphology index.
  // This keeps the two selectors in sync with the actual corpus roots.
  const rootInitials = useMemo(() => {
    const collator = new Intl.Collator("ar");
    return Array.from(new Set(rootOptions.map(option => option.root[0]).filter(Boolean)))
      .sort((a, b) => collator.compare(a, b));
  }, [rootOptions]);

  const rootsForInitial = useMemo(() =>
    rootInitial ? rootOptions.filter(option => option.root.startsWith(rootInitial)) : [],
  [rootOptions, rootInitial]);

  // Load the morphology database when the Roots tab first opens.
  useEffect(() => {
    if (researchTab !== "roots" || morph || morphLoading) return;
    void loadMorphology().catch(() => { /* loadMorphology reports the error */ });
    // loadMorphology uses the existing loading/error state and caches the corpus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [researchTab, morph]);

  const pendingJump = useRef<{ chapter: number; verse: number; selectForAnalysis?: boolean } | null>(null);
  const scrollTarget = useRef<string | null>(null);
  const [password, setPassword] = useState("");
  const [publicationDraft, setPublicationDraft] = useState("");
  const [savedDrafts, setSavedDrafts] = useState<SavedDraft[]>([]);
  const [draftToOpen, setDraftToOpen] = useState("");
  const draftBeingEdited = useRef(false);
  const [draftStatus, setDraftStatus] = useState("");
  const [publicationApproved, setPublicationApproved] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationStatus, setPublicationStatus] = useState("");
  const [publishedEditorStatus, setPublishedEditorStatus] = useState("");
  const [publishedEditorLoading, setPublishedEditorLoading] = useState(false);
  const [loadedPublishedVersion, setLoadedPublishedVersion] = useState<{reference:string;version:number;publishedAt:string}|null>(null);
  const publishedEditorRequest = useRef(0);
  const [publicAnalysis, setPublicAnalysis] = useState<{ reference: string; version: number; publishedAt: string; content: string } | null>(null);
  const [publicLoadState, setPublicLoadState] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const [aiResponse, setAiResponse] = useState("");
  const [auditReport, setAuditReport] = useState<{ findings: { quote: string; issue: string; evidenceRef: string; evidenceQuote: string; suggestion: string }[]; unresolved: string[]; deterministicFindings?: number; grammarStatus?: string; evidenceStatus?: string } | null>(null);
  const [evidenceAudit, setEvidenceAudit] = useState<{
    references: string[];
    researchSources: { id: string; title: string; section: string; complete?: boolean; parts?: number }[];
    focalReference?: string;
    contextReferences?: string[];
    researchSections?: { section: string; article: string; complete: boolean; parts: number }[];
    researchReferences: string[];
    lexical: { lemma: string; total: number; supplied: number }[];
    sources: Record<string, string[]>;
  } | null>(null);
  const [argumentAudit, setArgumentAudit] = useState<{
    issue: string; claims: { claim: string; source: string; premises: string[]; evidenceRefs: string[]; status: string }[];
    disputed: string[]; notNecessarilyDisputed: string[];
  } | null>(null);
  const [unsuppliedReferences, setUnsuppliedReferences] = useState<string[]>([]);
  // Immutable identity of the request being streamed (independent of Reader navigation).
  const [analysisReference, setAnalysisReference] = useState<string | null>(null);
  const [readerStatus, setReaderStatus] = useState("");
  const [incomplete, setIncomplete] = useState(false);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (!publicMode) setSavedDrafts(readSavedDrafts());
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => { if (!r.ok) throw new Error("Surah list unavailable"); return r.json(); })
      .then((j: QuranResponse<Surah[]>) => setSurahs(j.data))
      .catch(() => setReaderStatus("Could not load the surah list. Check network access."));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setAyahs([]); setSelected([]); setSelectedSearch([]);
    fetch(`https://api.alquran.cloud/v1/surah/${chapter}/quran-uthmani`)
      .then((r) => { if (!r.ok) throw new Error("Unable to fetch Arabic text"); return r.json(); })
      .then((j: QuranResponse<{ ayahs: Ayah[] }>) => { if (!cancelled) {
        setAyahs(j.data.ayahs);
        setReaderStatus("");
        if (pendingJump.current?.chapter === chapter) {
          const verse = pendingJump.current.verse;
          if (verse <= j.data.ayahs.length) {
            setSelected(pendingJump.current.selectForAnalysis === false ? [] : [verse]);
            scrollTarget.current = refOf(chapter, verse);
          } else {
            setGlobalError(`Surah ${chapter} has only ${j.data.ayahs.length} verses.`);
          }
          pendingJump.current = null;
        }
      } })
      .catch(() => { if (!cancelled) setReaderStatus("Unable to load Arabic text from the data provider."); });
    return () => { cancelled = true; };
  }, [chapter]);

  useEffect(() => {
    let cancelled = false;
    setTranslations([]);
    setTranslationError("");
    if (edition === "ur.islahi") {
      loadIslahiQuran()
        .then(data => { if (!cancelled) setIslahi(data); })
        .catch(() => { if (!cancelled) setTranslationError("Unable to load the 114-surah Islahi Urdu translation."); });
    } else if (edition === "gerrans") {
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

  function goToReference(targetChapter: number, targetVerse: number, selectForAnalysis = true) {
    const target = refOf(targetChapter, targetVerse);
    setSearch(String(targetVerse));
    scrollTarget.current = target;
    setGlobalResults([]);
    setGlobalTotal(null);
    setShowSearchResults(false);
    if (chapter === targetChapter && ayahs.some(a => a.numberInSurah === targetVerse)) {
      setSelected(selectForAnalysis ? [targetVerse] : []);
    } else {
      pendingJump.current = { chapter: targetChapter, verse: targetVerse, selectForAnalysis };
      setSelected([]);
      setChapter(targetChapter);
    }
  }

  // An analysis citation is a reader-only jump: the active DeepSeek stream,
  // its focal verse, and the published analysis on the right remain unchanged.
  function onAnalysisCitationClick(event: MouseEvent<HTMLDivElement>) {
    const element = event.target;
    if (!(element instanceof Element)) return;
    const anchor = element.closest('a[href^="#ccc-quran-ref-"]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const citation = parseReaderCitationHash(anchor.hash);
    if (!citation) return;
    event.preventDefault();
    goToReference(citation.chapter, citation.verse, false);
  }

  // Deep link from Corpus Search: /quran?verse=25:5&word=4.
  // Verse jumps use the Reader's existing navigation; the optional corpus word
  // position opens the same Grammar inspector without guessing word alignment.
  const initialCorpusJumpHandled = useRef(false);
  useEffect(() => {
    if (initialCorpusJumpHandled.current) return;
    initialCorpusJumpHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("verse")?.match(/^(\d{1,3}):(\d{1,3})$/);
    if (!reference) return;
    const targetChapter = Number(reference[1]);
    const targetVerse = Number(reference[2]);
    if (targetChapter < 1 || targetChapter > 114 || targetVerse < 1 || targetVerse > 286) return;
    goToReference(targetChapter, targetVerse);
    const corpusWord = Number(params.get("word"));
    if (Number.isInteger(corpusWord) && corpusWord > 0 && corpusWord <= 300) {
      setResearchTab("grammar");
      void loadMorphology()
        .then(data => {
          const reference = `${targetChapter}:${targetVerse}`;
          const token = data[reference]?.[corpusWord - 1];
          if (token) setWordChoice({
            reference, index: corpusWord,
            display: token.s.map(segment => translitToArabic(segment[0])).join("")
          });
        })
        .catch(() => { /* error is displayed in the inspector */ });
    }
    // URL parameters represent a one-time external navigation, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setShowSearchResults(false);
    setSelectedSearch([]);
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
      // Both Arabic and English are displayed for every matching verse.
      if (true) {
        if (edition === "ur.islahi") {
          gerransMap = await loadIslahiQuran();
          setIslahi(gerransMap);
        } else if (edition === "gerrans") {
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
      setShowSearchResults(true);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Unable to complete corpus search.");
    } finally { setGlobalLoading(false); }
  }

  function openSearchResult(result: SearchResult) {
    setShowSearchResults(false);
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
    setRootMatches([]); setRootTotal(null); setRootGroupShown({});
    if (!requested) return;
    try {
      const dataset = await loadMorphology();
      const results: RootHit[] = [];
      for (const [reference, words] of Object.entries(dataset)) {
        words.forEach((w, index) => {
          if (w.r && normalizedRoot(translitToArabic(w.r)) === requested) {
            const verb = w.s.find(segment => segment[1] === "V");
            const formTag = verb?.[2].match(/\((I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)\)/)?.[1];
            const noun = w.s.find(segment => ["N", "ADJ", "PN"].includes(segment[1]));
            const morphology = verb
              ? `Verb · ${formTag ? `Form ${formTag}` : "Form I"}`
              : noun ? (partOfSpeechLabels[noun[1]] || "Noun") : "Other form";
            const surface = w.s.map(segment => translitToArabic(segment[0])).join("");
            const group = rootGrammaticalGroup(w);
            const lemma = w.l ? translitToArabic(w.l) : "Unspecified lemma";
            const romanized = corpusRomanization(w.s.map(segment => segment[0]).join(""));
            results.push({ reference, index: index + 1, surface, morphology, group, lemma, romanized });
          }
        });
      }
      setRootTotal(results.length);
      setRootMatches(results);
      // The corpus word form is immediately available. Enrich it with a verse
      // excerpt only when an exact Arabic word alignment can be verified.
      try {
        if (!arabicCorpus.current) arabicCorpus.current = await getFullCorpus("quran-uthmani");
        const verses = new Map<string, string>();
        for (const surah of arabicCorpus.current) {
          for (const ayah of surah.ayahs) {
            const reference = refOf(surah.number, ayah.numberInSurah);
            if (dataset[reference]) verses.set(reference, ayah.text);
          }
        }
        const alignmentCache = new Map<string, { tokens: string[]; mapping: (number | null)[] }>();
        const enriched = results.map(hit => {
          const arabic = verses.get(hit.reference);
          const words = dataset[hit.reference];
          if (!arabic || !words) return hit;
          let aligned = alignmentCache.get(hit.reference);
          if (!aligned) {
            const tokens = arabic.trim().split(/\s+/);
            aligned = { tokens, mapping: alignVerseWords(tokens, words) };
            alignmentCache.set(hit.reference, aligned);
          }
          const at = aligned.mapping.findIndex(position => position === hit.index);
          if (at < 0) return hit;
          return {
            ...hit,
            surface: aligned.tokens[at],
            context: {
              before: aligned.tokens.slice(Math.max(0, at - 5), at),
              match: aligned.tokens[at],
              after: aligned.tokens.slice(at + 1, at + 6)
            }
          };
        });
        setRootMatches(enriched);
      } catch {
        // Do not block the concordance when the optional Arabic text service fails.
      }
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
  const inspectorRomanized = inspectedWord ? inspectorTransliteration(inspectedWord) : "";
  const inspectorDictionaryUrl = inspectedWord?.r && wordChoice
    ? `https://corpus.quran.com/qurandictionary.jsp?q=${encodeURIComponent(inspectedWord.r)}#(${wordChoice.reference}:${wordChoice.index})`
    : "";

  const selectedAyahs = ayahs.filter(a => selected.includes(a.numberInSurah));
  const analysisVerses = showSearchResults
    ? selectedSearch.map(r => ({ chapter: r.chapter, verse: r.verse, arabic: r.arabic }))
    : selectedAyahs.map(a => ({ chapter, verse: a.numberInSurah, arabic: a.text }));
  const currentSurah = surahs.find(s => s.number === chapter);
  function toggleAyah(n: number) {
    // Reader selection is independent of any active or completed Chutes stream.
    setSelected(old => old.length === 1 && old[0] === n ? [] : [n]);
  }
  function toggleSearchVerse(result: SearchResult) {
    setSelectedSearch(old => old.length === 1 && old[0].chapter === result.chapter && old[0].verse === result.verse ? [] : [result]);
  }
  const analysisVerse = analysisVerses[0] || null;
  // The public Reader NEVER calls the paid inference endpoint.
  const selectedPublicReference = analysisVerse ? refOf(analysisVerse.chapter, analysisVerse.verse) : null;
  useEffect(() => {
    if (!publicMode || researchTab !== "analysis" || !selectedPublicReference) return;
    let active = true;
    setPublicAnalysis(null); setPublicLoadState("loading");
    const [surah, ayah] = selectedPublicReference.split(":");
    fetch(`/published-analyses/${surah}/${ayah}.json`, { cache: "no-store" })
      .then(async response => {
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json() as { reference: string; version: number; publishedAt: string; content: string };
      })
      .then(record => { if (!active) return; setPublicAnalysis(record); setPublicLoadState(record ? "idle" : "missing"); })
      .catch(() => { if (active) setPublicLoadState("error"); });
    return () => { active = false; };
  }, [publicMode, researchTab, selectedPublicReference]);

  // Admin-only: published files are durable, public read-only records. Loading a
  // published version creates an editable working copy; only Publish writes back.
  // The original published record remains unchanged until an approved publish.
  async function loadPublishedForEditing() {
    if (publicMode || loading || publishing || publishedEditorLoading || !selectedPublicReference) return;
    const reference = selectedPublicReference;
    if ((publicationDraft.trim() || aiResponse.trim()) &&
        !window.confirm(`Replace the current editor with published analysis ${reference}? Save any unsaved changes first.`)) return;
    const request = ++publishedEditorRequest.current;
    setPublishedEditorLoading(true);
    setPublishedEditorStatus(`Loading published ${reference}…`);
    try {
      const [surah, ayah] = reference.split(":");
      const response = await fetch(`/published-analyses/${surah}/${ayah}.json`, { cache: "no-store" });
      if (response.status === 404) throw new Error(`No published analysis exists for ${reference}. Run a new analysis instead.`);
      if (!response.ok) throw new Error(`Unable to load published analysis (HTTP ${response.status}).`);
      const record = await response.json() as { reference?:string;version?:number;publishedAt?:string;content?:string };
      if (record.reference !== reference || !Number.isInteger(record.version) ||
          typeof record.content !== "string" || !record.content.trim()) {
        throw new Error("Published record is invalid or its verse reference does not match.");
      }
      if (request !== publishedEditorRequest.current) return;
      draftBeingEdited.current = true; // protect the imported text from model-sync effects
      setAnalysisReference(reference);
      setAiResponse(record.content);
      setPublicationDraft(record.content);
      setPublicationApproved(false);
      setIncomplete(false);
      // These verification artifacts belong to another AI run, not the published text.
      setEvidenceAudit(null); setArgumentAudit(null); setAuditReport(null); setUnsuppliedReferences([]);
      setLoadedPublishedVersion({reference, version:record.version as number, publishedAt:record.publishedAt || ""});
      setPublicationStatus(""); setDraftStatus("");
      setPublishedEditorStatus(`Loaded published ${reference} v${record.version}. Edit below, Save draft, or approve and publish a revision.`);
    } catch (error) {
      if (request === publishedEditorRequest.current)
        setPublishedEditorStatus(error instanceof Error ? error.message : "Could not load published analysis.");
    } finally {
      if (request === publishedEditorRequest.current) setPublishedEditorLoading(false);
    }
  }

  // Never overwrite a draft the author is editing, including while the model streams.
  // Generate a fresh editable proposal only after the current analysis finishes.
  useEffect(() => {
    if (publicMode || loading || !analysisReference || !aiResponse || draftBeingEdited.current) return;
    setPublicationDraft(cleanAnalysisText(aiResponse));
    setPublicationApproved(false);
  }, [aiResponse, analysisReference, loading, publicMode]);

  function savePublicationDraft() {
    if (publicMode || loading || !analysisReference || !publicationDraft.trim()) return;
    const record: SavedDraft = {
      reference: analysisReference, content: publicationDraft,
      updatedAt: new Date().toISOString(), evidenceAudit, argumentAudit, auditReport, unsuppliedReferences,
    };
    const next = [record, ...readSavedDrafts().filter(item => item.reference !== record.reference)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(next));
      setSavedDrafts(next);
      setDraftToOpen(record.reference);
      draftBeingEdited.current = true;
      setDraftStatus(`Draft ${record.reference} saved in this browser. It is not published.`);
    } catch {
      setDraftStatus("Unable to save: browser storage is unavailable or full. Copy the draft before leaving.");
    }
  }

  function openPublicationDraft() {
    if (publicMode || loading || !draftToOpen) return;
    const record = readSavedDrafts().find(item => item.reference === draftToOpen);
    if (!record) { setDraftStatus("Saved draft unavailable in this browser."); return; }
    draftBeingEdited.current = true;
    setAnalysisReference(record.reference);
    setPublicationDraft(record.content);
    setAiResponse(record.content);
    setEvidenceAudit((record.evidenceAudit as typeof evidenceAudit) || null);
    setArgumentAudit((record.argumentAudit as typeof argumentAudit) || null);
    setAuditReport((record.auditReport as typeof auditReport) || null);
    setUnsuppliedReferences(record.unsuppliedReferences || []);
    setPublicationApproved(false);
    setIncomplete(false);
    setResearchTab("analysis");
    setLoadedPublishedVersion(null);
    setPublishedEditorStatus("");
    setDraftStatus(`Opened saved draft ${record.reference} for editing. Changes require Save draft.`);
  }

  async function publishAnalysis() {
    if (publicMode || !analysisReference || !publicationApproved || !publicationDraft.trim() || incomplete || loading) return;
    setPublishing(true); setPublicationStatus("Publishing approved analysis…");
    try {
      const response = await fetch("/api/publish-analysis", {
        method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "x-ccc-passcode": password },
        body: JSON.stringify({ reference: analysisReference, content: publicationDraft, evidenceAudit, argumentAudit, auditReport, unsuppliedReferences }),
      });
      const body = await response.json() as { error?: string; version?: number; reference?: string };
      if (!response.ok) throw new Error(body.error || `Publish failed (HTTP ${response.status})`);
      setPublicationStatus(`Published ${body.reference} version ${body.version} to the repository. Public availability follows Vercel deployment.`);
      setPublicationApproved(false);
    } catch (error) { setPublicationStatus(error instanceof Error ? error.message : "Publication failed"); }
    finally { setPublishing(false); }
  }

  function cancelAnalysis() {
    analysisRun.current++;
    analysisAbort.current?.abort();
    analysisAbort.current = null;
    setLoading(false);
    setStatus("Analysis stopped. Any text already received is retained.");
    setIncomplete(true);
  }
  async function analyze() {
    if (!publicMode && !loading && (publicationDraft.trim() || aiResponse.trim()) &&
        !window.confirm("Start a new AI analysis? This replaces the current editable text. Save the draft first if you want to retain it.")) return;
    if (!analysisVerse) { setStatus("Select a verse in the Reader first."); return; }
    analysisAbort.current?.abort();
    const request = new AbortController();
    analysisAbort.current = request;
    const run = ++analysisRun.current;
    const reference = `${analysisVerse.chapter}:${analysisVerse.verse}`;
    draftBeingEdited.current = false;
    setLoadedPublishedVersion(null);
    setPublishedEditorStatus("");
    setPublicationDraft("");
    setPublicationApproved(false);
    setDraftStatus("");
    setAnalysisReference(reference);
    setResearchTab("analysis");
    setLoading(true); setStatus("Connecting to analysis model…"); setAiResponse(""); setIncomplete(false); setAuditReport(null); setEvidenceAudit(null); setArgumentAudit(null); setUnsuppliedReferences([]);
    let collected = "";
    let discovered: string[] = [];
    let reconstruction = "";
    let auditFindingCount = 0;
    let evidenceGapCount = 0;
    try {
      // Discovery precedes the two writing stages. Verification is advisory;
      // the Reader remains independent throughout all four network calls.
      for (const stage of ["discovery", "reconstruction", "foundation", "synthesis", "audit"] as const) {
        if (run !== analysisRun.current || request.signal.aborted) return;
        setStatus(stage === "discovery" ? "Selecting evidence (1/5)…" : stage === "reconstruction" ? "Reconstructing article arguments (2/5)…" : stage === "foundation" ? "Analyzing grammar and context (3/5)…" : stage === "synthesis" ? "Evaluating evidence and logic (4/5)…" : "Checking material claims (5/5)…");
        const foundation = collected;
        const response = await fetch("/api/verse-analysis?protocol=sse-v1", {
          method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", "Accept": "text/event-stream", "x-ccc-passcode": password },
          body: JSON.stringify({ chapter: analysisVerse.chapter, verse: analysisVerse.verse, stage, ...(stage === "synthesis" || stage === "audit" ? { prior: foundation } : {}), ...(stage !== "discovery" ? { evidence: discovered } : {}), ...(reconstruction ? { argument: reconstruction } : {}) }),
          signal: request.signal,
        });
        const type = (response.headers.get("content-type") || "").toLowerCase();
        const protocol = response.headers.get("x-verse-analysis-protocol") || "";
        if (!response.ok || !type.includes("text/event-stream")) {
          const payload = await response.text();
          let message: string | undefined;
          if (type.includes("application/json")) {
            try { message = (JSON.parse(payload) as { error?: string }).error; } catch { /* invalid response */ }
          }
          throw new Error(message || `Analysis endpoint HTTP ${response.status}; expected a live stream. Check Vercel Runtime Logs.`);
        }
        if (protocol !== "sse-v1") throw new Error("Analysis endpoint version mismatch: deploy both matching v7.7 files and hard-refresh the Reader.");
        if (!response.body) throw new Error("Analysis endpoint returned no response stream.");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let lastRender = 0;
        let completed = false;
        let failed = false;
        let stageIncomplete = false;
        const processFrame = (frame: string) => {
          const event = frame.split("\n").find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
          const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
          if (!data) return;
          let value: { text?: string; message?: string; incomplete?: boolean; partial?: boolean; invalidReferences?: string[]; finishReason?: string; references?: string[]; researchSources?: { id: string; title: string; section: string; complete?: boolean; parts?: number }[]; researchReferences?: string[];
            focalReference?: string; contextReferences?: string[]; researchSections?: { section: string; article: string; complete: boolean; parts: number }[];
            reconstruction?: { issue: string; claims: { claim: string; source: string; premises: string[]; evidenceRefs: string[]; status: string }[]; disputed: string[]; notNecessarilyDisputed: string[] };
            unsuppliedReferences?: string[]; lexical?: { lemma: string; total: number; supplied: number }[]; sources?: Record<string, string[]>; findings?: { quote: string; issue: string; evidenceRef: string; evidenceQuote: string; suggestion: string }[]; unresolved?: string[];
            deterministicFindings?: number; grammarStatus?: string; evidenceStatus?: string; coverageGaps?: string[] };
          try { value = JSON.parse(data); } catch { return; }
          if (event === "delta") {
            const chunk = value.text || "";
            if (stage === "synthesis" && collected === foundation && chunk) collected += "\n\n";
            collected += chunk;
            if (Date.now() - lastRender >= 125) { setAiResponse(collected); lastRender = Date.now(); }
          } else if (event === "evidence") {
            discovered = (value.references || []).filter(r => /^\d{1,3}:\d{1,3}$/.test(r));
            setEvidenceAudit({ references: discovered, researchSources: value.researchSources || [],
              researchReferences: value.researchReferences || [], lexical: value.lexical || [],
              sources: value.sources || {}, focalReference: value.focalReference,
              contextReferences: value.contextReferences || [], researchSections: value.researchSections || [] });
            evidenceGapCount = (value.coverageGaps || []).length;
            setStatus(`Selected ${discovered.length} pan-textual evidence passages${evidenceGapCount ? `; ${evidenceGapCount} central-lemma coverage gaps` : ""}.`);
          } else if (event === "argument") {
            if (value.reconstruction) {
              reconstruction = JSON.stringify(value.reconstruction);
              setArgumentAudit(value.reconstruction);
            }
          } else if (event === "audit") {
            // Advisory findings only: the verifier may identify errors but
            // cannot silently replace an interpretation with another guess.
            auditFindingCount = (value.findings || []).length;
            setAuditReport({ findings: value.findings || [], unresolved: value.unresolved || [],
              deterministicFindings: value.deterministicFindings, grammarStatus: value.grammarStatus, evidenceStatus: value.evidenceStatus });
          } else if (event === "status") {
            setStatus(value.message || "Analyzing…");
          } else if (event === "done") {
            completed = true;
            stageIncomplete = Boolean(value.incomplete);
            setAiResponse(collected);
            if (value.unsuppliedReferences?.length) setUnsuppliedReferences(value.unsuppliedReferences);
            const warnings = value.invalidReferences?.length ? ` Unverified references: ${value.invalidReferences.join(", ")}.` : "";
            setStatus((stageIncomplete ? `Stage ${stage} was truncated (finish: ${value.finishReason || "unknown"}).` : stage === "discovery" ? "Evidence selected. Reconstructing arguments…" : stage === "reconstruction" ? "Argument reconstruction complete. Beginning grammar…" : stage === "foundation" ? "Grammar and context complete. Beginning synthesis…" : stage === "synthesis" ? "Five sections generated. Checking material claims…" : "Verification complete.") + warnings);
          } else if (event === "error") {
            completed = true;
            failed = true;
            setAiResponse(collected);
            setStatus(value.message || "Analysis stream failed.");
          }
        };
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (run !== analysisRun.current) return;
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            while (true) {
              const match = /\r?\n\r?\n/.exec(buffer);
              if (!match) break;
              const frame = buffer.slice(0, match.index).replace(/\r\n/g, "\n");
              buffer = buffer.slice(match.index + match[0].length);
              processFrame(frame);
            }
            if (buffer.length > 2_000_000) throw new Error("Invalid oversized analysis event.");
          }
          buffer += decoder.decode();
          if (buffer.trim()) processFrame(buffer.replace(/\r\n/g, "\n"));
        } finally { reader.releaseLock(); }
        if (!completed || failed || stageIncomplete) {
          setAiResponse(collected);
          setIncomplete(true);
          // Preserve generated text, but do not describe an unverified analysis as completed.
          if (stage === "audit" && !failed && !stageIncomplete) setStatus("Verification did not finish. Analysis retained as UNVERIFIED.");
          if (!completed) setStatus(`Stage ${stage} ended unexpectedly. Partial text retained.`);
          return;
        }
      }
      if (run === analysisRun.current) { setAiResponse(collected); setIncomplete(false);
        setStatus(auditFindingCount > 0
          ? `Analysis complete — verification completed with ${auditFindingCount} flagged issue(s); review findings below.`
          : `Analysis complete — structured verification completed; no detected contradictions${evidenceGapCount ? ` (${evidenceGapCount} lexical coverage gap(s))` : ""}. Not a guarantee of correctness.`);
      }
    } catch (e) {
      if (run === analysisRun.current && !request.signal.aborted) {
        setAiResponse(collected); setIncomplete(Boolean(collected));
        setStatus(e instanceof Error ? e.message : "Unexpected streaming error");
      }
    } finally {
      if (run === analysisRun.current) {
        setAiResponse(collected); setLoading(false); analysisAbort.current = null;
      }
    }
  }

  return (
    <main id={publicMode ? "ccc-public-research" : undefined} className={`${styles.main} ${creditsStyles.fluidWorkspace}`}
      style={publicMode ? { paddingTop: "0.25rem", marginTop: 0 } : undefined}>
      {publicMode && <style>{`
        /* Hide the actual site's shared navigation on publicquran only. */
        body:has(#ccc-public-research) [data-ccc-public-hide-header="true"] {
          display: none !important;
        }
        #ccc-public-research { padding-top: 0.25rem !important; margin-top: 0 !important; }
      `}</style>}
      {!publicMode && <div className={styles.header} style={{ paddingBlock: "0.25rem", marginBottom: "0.65rem", alignItems: "center" }}>
        <div>
          <a href="/" className={styles.back}>← CCC Framework</a>
          <h1 style={{ fontSize: "1.35rem", lineHeight: 1.2, margin: "0.25rem 0 0" }}>Qurʾān Research Engine</h1>
        </div>
        <span className={styles.beta}>Qurʾān-only research</span>
      </div>}
      <nav aria-label="Qurʾān research navigation" style={{ display: "flex", gap: publicMode ? 4 : 7, padding: publicMode ? 3 : 6, marginBottom: publicMode ? 8 : 20, border: "1px solid #e0e4e9", background: "#f2f3f5", borderRadius: 11 }}>
        <a href={publicMode ? "/publicquran" : "/quran"} aria-current="page" style={{ flex: 1, textDecoration: "none", textAlign: "center", borderRadius: 8, background: "#25364e", color: "white", padding: publicMode ? "6px 8px" : "12px 10px", fontWeight: 600, fontSize: 14 }}>Qurʾān Research Engine</a>
        <a href="/quran/corpus" target="_blank" rel="noopener noreferrer" title="Open Corpus Search in a new tab; the Reader and any running analysis stay open" style={{ flex: 1, textDecoration: "none", textAlign: "center", borderRadius: 8, color: "#364456", padding: publicMode ? "6px 8px" : "12px 10px", fontWeight: 600, fontSize: 14 }}>Corpus Search ↗</a>
      </nav>
      <section className={styles.globalSearch} aria-label="Search the entire Quran" style={{ padding: publicMode ? "0.4rem 0.6rem" : "0.65rem 0.8rem" }}>
        <form onSubmit={searchWholeQuran} className={styles.globalSearchForm}>
          <input aria-label="Quran-wide search keyword" value={globalQuery} onChange={e => setGlobalQuery(e.target.value)} placeholder={globalLanguage === "arabic" ? "19:28 or Arabic word (e.g. مريم)" : edition === "ur.islahi" ? "2:255 or Urdu word" : "19:28 or English word (e.g. mercy)"} />
          <select aria-label="Search language" value={globalLanguage} onChange={e => setGlobalLanguage(e.target.value as "arabic" | "english")}>
            <option value="arabic">Arabic</option><option value="english">Selected translation</option>
          </select>
          <button type="submit" disabled={globalLoading}>{globalLoading ? "Searching…" : "Go / Search"}</button>
        </form>
        {globalError && <p role="alert" className={styles.searchError}>{globalError}</p>}
      </section>
      <div className={`${styles.layout} ${researchExpanded ? styles.researchExpandedLayout : ""} ${creditsStyles.fluidColumns}`}
        style={{ "--ccc-reader-width": `${researchExpanded ? 40 : readerWidth}%` } as CSSProperties}>
        <section className={styles.panel} aria-label="Quran reader">
          <div className={styles.panelHeader}><h2>{showSearchResults ? "Search results" : "Qurʾān reader"}</h2><span>{showSearchResults ? `${globalTotal ?? 0} matching verses` : `${ayahs.length} verses`}</span></div>
          <div className={styles.controls}>
            <label>Surah
              <select value={chapter} onChange={e => {setShowSearchResults(false); setSearch(""); setChapter(Number(e.target.value));}}>
                {surahs.length ? surahs.map(s => <option value={s.number} key={s.number}>{s.number}. {s.englishName}</option>) : <option value={1}>1. Al-Faatiha</option>}
              </select>
            </label>
            <label>Verse
              <select
                aria-label="Choose verse within surah"
                value={search}
                onChange={e => {
                  setShowSearchResults(false);
                  setSearch(e.target.value);
                }}
              >
                <option value="">All verses</option>
                {ayahs.map(a => (
                  <option key={a.numberInSurah} value={String(a.numberInSurah)}>
                    {a.numberInSurah}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={styles.translationControl}>
            <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: "0.4rem", rowGap: "0.1rem" }}>
              <label htmlFor="ccc-translation">Translation / Urdu exposition</label>
              {!showSearchResults && <span className={styles.hint} style={{ margin: 0 }}>— Select one verse for detailed analysis. {currentSurah?.englishName || ""}</span>}
            </div>
            <select id="ccc-translation" value={edition} onChange={e => {setEdition(e.target.value as TranslationEdition); setShowSearchResults(false);}}>
              {editions.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            {translationError && <p className={styles.translationNotice}>{translationError}</p>}
          </div>
          {showSearchResults ? (
            <div className={styles.resultsToolbar}>
              <span><strong>{globalTotal ?? 0}</strong> matches · Arabic and {editions.find(e => e.id === edition)?.name}</span>
              <button type="button" onClick={() => {setShowSearchResults(false); setGlobalResults([]); setGlobalTotal(null); setSelectedSearch([]);}}>Back to surah reader</button>
            </div>
          ) : null}
          {readerStatus && <p role="alert" className={styles.status}>{readerStatus}</p>}
          <div className={creditsStyles.audioHost}>
            <button
              type="button"
              aria-expanded={recitationExpanded}
              aria-controls="ccc-recitation-panel"
              onClick={() => setRecitationExpanded(open => !open)}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", padding: "0.3rem 0.45rem", margin: "0.15rem 0", border: 0, borderRadius: 5, background: "transparent", color: "inherit", font: "inherit", fontSize: "0.85rem", fontWeight: 600, cursor: "pointer" }}
            >
              <span aria-hidden="true" style={{ display: "inline-block", width: "1rem", textAlign: "center" }}>{recitationExpanded ? "▾" : "▸"}</span>
              Verse recitation
              {verseAudio.current && <span style={{ fontWeight: 400, opacity: 0.75 }}>· {verseAudio.current.chapter}:{verseAudio.current.verse}</span>}
            </button>
            <div id="ccc-recitation-panel" style={{ display: recitationExpanded ? "block" : "none" }}>
              <VerseAudioDock audio={verseAudio} goToVerse={goToReference} />
            </div>
          </div>
          <div className={styles.verses}>
            {showSearchResults && <>
              {globalResults.slice(0, globalShown).map(result => {
                const chosen = selectedSearch.some(r => r.chapter === result.chapter && r.verse === result.verse);
                return <div className={`${styles.ayah} ${chosen ? styles.chosen : ""} ${verseAudio.isActive(result.chapter, result.verse) ? audioStyles.activeVerse : ""}`} style={{ minHeight: "unset", paddingTop: "0.75rem", paddingBottom: "0.75rem", gap: "0.6rem" }} key={`${result.chapter}:${result.verse}`}>
                  <div className={styles.verseToolbar}>
                    <button type="button" className={styles.searchRef} onClick={() => openSearchResult(result)} title="Open this verse in the surah reader">{refOf(result.chapter, result.verse)} <span aria-hidden="true">↗</span></button>
                    <button type="button" className={styles.verseSelect} onClick={() => toggleSearchVerse(result)} aria-pressed={chosen}>{chosen ? "Selected ✓" : "Select verse"}</button>
                    <VerseAudioButton audio={verseAudio} chapter={result.chapter} verse={result.verse} />
                  </div>
                  <span dir="rtl" lang="ar" className={styles.arabic}><span className={creditsStyles.fontPlusOnePoint}>{result.arabic}</span></span>
                  <span className={`${styles.english} ${edition === "ur.islahi" ? styles.urduTranslation : ""}`} lang={edition === "ur.islahi" ? "ur" : "en"} dir={edition === "ur.islahi" ? "rtl" : "ltr"}><span className={creditsStyles.fontPlusOnePoint}>{result.english || (edition === "ur.islahi" ? "Islahi Urdu translation unavailable for this verse." : "Translation unavailable for this verse.")}</span></span>
                  <VerseReferences chapter={result.chapter} verse={result.verse} />
                  <VerseCopyControls reference={refOf(result.chapter, result.verse)} arabic={result.arabic}
                    translation={result.english || ""} urdu={edition === "ur.islahi"} />
                </div>;
              })}
              {globalTotal === 0 && <p className={styles.hint}>No exact matches. Try another spelling or a shorter keyword.</p>}
              {globalTotal !== null && globalShown < globalTotal && <button type="button" className={styles.moreResults} onClick={() => setGlobalShown(n => n + MAX_SEARCH_RESULTS)}>Show next 100 matches</button>}
            </>}
            {!showSearchResults && <>
            {visible.map(a => {
              const translation = edition === "ur.islahi"
                ? (islahi[refOf(chapter, a.numberInSurah)] || "")
                : edition === "gerrans"
                  ? (gerrans[refOf(chapter, a.numberInSurah)] || "")
                  : (translations.find(t => t.numberInSurah === a.numberInSurah)?.text || "");
              return <div id={`ccc-verse-${chapter}-${a.numberInSurah}`} key={a.numberInSurah}
              className={`${styles.ayah} ${selected.includes(a.numberInSurah) ? styles.chosen : ""} ${verseAudio.isActive(chapter, a.numberInSurah) ? audioStyles.activeVerse : ""}`} style={{ minHeight: "unset", paddingTop: "0.75rem", paddingBottom: "0.75rem", gap: "0.6rem" }}>
              <div className={styles.verseToolbar}><span className={styles.ref}>{refOf(chapter, a.numberInSurah)}</span><button type="button" className={styles.verseSelect} onClick={() => toggleAyah(a.numberInSurah)} aria-pressed={selected.includes(a.numberInSurah)}>{selected.includes(a.numberInSurah) ? "Selected ✓" : "Select verse"}</button><VerseAudioButton audio={verseAudio} chapter={chapter} verse={a.numberInSurah} /></div>
              <span className={styles.arabic} dir="rtl" lang="ar"><span className={creditsStyles.fontPlusOnePoint}>{(() => {
                const reference = refOf(chapter, a.numberInSurah);
                const tokens = a.text.trim().split(/\s+/);
                const basmalahOffset = verseBasmalahOffset(chapter, a.numberInSurah, tokens);
                const mapping = morph?.[reference] ? alignVerseWords(tokens, morph[reference]) : null;
                return <>
                  {basmalahOffset > 0 && <span className={styles.verseBasmalah}>{tokens.slice(0, basmalahOffset).join(" ")}</span>}
                  <span className={styles.verseArabicWords}>{tokens.slice(basmalahOffset).map((token, position) => {
                    const i = position + basmalahOffset;
                    // Preserve original token positions for corpus alignment and inspection.
                    const safe = !mapping || mapping[i] !== null;
                    return <button key={i} type="button" className={styles.arabicWord}
                      style={{ fontSize: "inherit" }}
                      disabled={!safe}
                      title={safe ? `Inspect word ${i + 1}` : "Word could not be aligned confidently; grammar withheld"}
                      onClick={() => void inspectWord(reference, i + 1, token, a.text)}>{token}</button>;
                  })}</span>
                </>;
              })()}</span></span>
              <span className={`${styles.english} ${edition === "ur.islahi" ? styles.urduTranslation : ""}`} 
                lang={edition === "ur.islahi" ? "ur" : "en"} dir={edition === "ur.islahi" ? "rtl" : "ltr"}>
                <span className={creditsStyles.fontPlusOnePoint}>{translation || (edition === "ur.islahi"
                  ? (translationError || "Loading Urdu text…")
                  : edition === "gerrans"
                    ? "Gerrans translation not installed for this verse."
                    : (translationError || "Loading translation…"))}</span>
              </span>
              <VerseReferences chapter={chapter} verse={a.numberInSurah} />
              <VerseCopyControls reference={refOf(chapter, a.numberInSurah)} arabic={a.text}
                translation={translation} urdu={edition === "ur.islahi"} />
            </div>;
            })}
            {ayahs.length === 0 && <p className={styles.hint}>Loading the Arabic Qurʾān…</p>}
            {ayahs.length > 0 && visible.length === 0 && <p className={styles.hint}>No matches in this surah.</p>}
            </>}
          </div>
          <button type="button" className={creditsStyles.creditsLink} onClick={() => setCreditsOpen(true)} aria-haspopup="dialog">Credits &amp; sources</button>
        </section>
        <aside className={`${styles.sidebar} ${styles.researchSide}`} aria-label="Qurʾān study tools">
          <section className={`${styles.panel} ${styles.researchPanel}`}>
            <div className={styles.panelHeader}>
              <h2>Study tools</h2>
              <div className={styles.researchActions}>
                <span>{loading && analysisReference ? `Streaming ${analysisReference}` : analysisVerse ? `Selected ${refOf(analysisVerse.chapter, analysisVerse.verse)}` : "Select a verse"}</span>
                <label className={creditsStyles.paneWidthControl} title="Adjust the width of the Qurʾān Reader and Study tools">
                  <span>Reader {researchExpanded ? 40 : readerWidth}%</span>
                  <input type="range" min="35" max="70" step="5"
                    aria-label="Reader pane width" value={researchExpanded ? 40 : readerWidth}
                    onChange={event => updateReaderWidth(Number(event.target.value))} />
                </label>
                <button
                  type="button"
                  className={styles.researchExpandButton}
                  aria-pressed={researchExpanded}
                  title={researchExpanded ? "Restore the standard two-column layout" : "Give analysis more horizontal space"}
                  onClick={() => setResearchExpanded(previous => !previous)}
                >
                  {researchExpanded ? "Standard width" : "Wider panel"}
                </button>
              </div>
            </div>
            <div role="tablist" aria-label="Qurʾān study tools" className={`${styles.researchTabs} ${creditsStyles.balancedStudyTabs}`}>
              {([['grammar', 'Grammar'], ['roots', 'Roots'], ['analysis', 'Detailed Analysis']] as const).map(([id, label]) => (
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
              <div className={styles.inspectorWordLine}>
                {inspectorRomanized && inspectorDictionaryUrl ? (
                  <a className={styles.inspectorTransliteration} href={inspectorDictionaryUrl}
                    target="_blank" rel="noopener noreferrer"
                    title="Open this word in the Qurʾānic Arabic Corpus dictionary">
                    {inspectorRomanized}
                  </a>
                ) : <span className={styles.inspectorTransliteration} aria-label="Transliteration unavailable">—</span>}
                <span dir="rtl" lang="ar" className={styles.inspectorArabic}>{wordChoice.display || (inspectedWord?.s.map(segment => translitToArabic(segment[0])).join("") ?? "")}</span>
              </div>
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
            <label className={styles.label} htmlFor="quran-root-initial">1. Choose the first Arabic letter
              <select
                id="quran-root-initial"
                aria-label="Choose first Arabic root letter"
                style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: "1px solid #cbd3dd", borderRadius: "8px", background: "#fff", color: "#1f2937", fontSize: "16px", cursor: "pointer" }}
                value={rootInitial}
                disabled={morphLoading || rootOptions.length === 0}
                onChange={event => {
                  setRootInitial(event.target.value);
                  // The text box is retained, including manually typed/pasted roots.
                  // Changing the initial letter does not erase its contents.
                }}
              >
                <option value="">{morphLoading ? "Loading Arabic roots…" : "Select an Arabic letter"}</option>
                {rootInitials.map(letter => (
                  <option key={letter} value={letter}>{letter}</option>
                ))}
              </select>
            </label>
            <label className={styles.label} htmlFor="quran-root-select">2. Choose a root
              <select
                id="quran-root-select"
                aria-label="Choose Qurʾānic Arabic root"
                style={{ width: "100%", boxSizing: "border-box", padding: "12px", border: "1px solid #cbd3dd", borderRadius: "8px", background: "#fff", color: "#1f2937", fontSize: "16px", cursor: "pointer" }}
                value={rootsForInitial.some(option => option.root === normalizedRoot(rootQuery)) ? normalizedRoot(rootQuery) : ""}
                disabled={morphLoading || !rootInitial}
                onChange={event => {
                  const root = event.target.value;
                  setRootQuery(root); // Populate the editable search box.
                  void findRoot(root); // Run the concordance immediately.
                }}
              >
                <option value="">{rootInitial ? `Select root (${rootsForInitial.length.toLocaleString("en")} available)` : "Choose a letter first"}</option>
                {rootsForInitial.map(({ root, count }) => (
                  <option key={root} value={root}>
                    {`${root} — ${count.toLocaleString("en")} occurrence${count === 1 ? "" : "s"}`}
                  </option>
                ))}
              </select>
            </label>
            <form className={styles.rootForm} onSubmit={event => {
              event.preventDefault();
              const normalized = normalizedRoot(rootQuery);
              if (normalized) setRootInitial(normalized[0]);
              void findRoot(rootQuery);
            }}>
              <input
                aria-label="Arabic root search box"
                dir="rtl"
                lang="ar"
                placeholder="Paste or type an Arabic root, e.g. ر ح م"
                value={rootQuery}
                onChange={event => setRootQuery(event.target.value)}
              />
              <button type="submit" disabled={!rootQuery.trim() || morphLoading}>Find root</button>
            </form>
            <p className={styles.hint}>Select a first letter, then a root. Choosing a root fills the search box and searches automatically. You can also paste an Arabic root into the box and press Find root.</p>
            <div style={{ marginTop: 12, marginBottom: 12, border: "1px solid #d9dfe8", borderRadius: 10, padding: 12, background: "#f8f9fb" }}>
              <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 4 }}>Advanced corpus analysis</div>
              <p className={styles.hint} style={{ marginTop: 0 }}>Explore this root across grammatical forms, or find all verbs of a form across the Qurʾān.</p>
              <a target="_blank" rel="noopener noreferrer" title="Open corpus tools in a new tab without interrupting the Reader analysis" style={{ color: "#234469", fontSize: 13, fontWeight: 650 }} href={rootOptions.some(option => option.root === normalizedRoot(rootQuery))
                ? `/quran/corpus?mode=root&letter=${encodeURIComponent(normalizedRoot(rootQuery)[0])}&root=${encodeURIComponent(normalizedRoot(rootQuery))}&form=any`
                : "/quran/corpus"}>
                Open in Corpus Search ↗
              </a>
            </div>
            {morphError && <p role="alert" className={styles.searchError}>{morphError}</p>}
            {rootTotal !== null && <div className={styles.rootConcordance}>
              <p className={styles.searchCount}>{rootTotal.toLocaleString("en")} annotated word occurrences across {rootGroups.length} grammatical {rootGroups.length === 1 ? "group" : "groups"}.</p>
              {rootGroups.map(group => {
                const visibleCount = rootGroupShown[group.name] ?? 50;
                return <section key={group.name} className={styles.rootGroupSection} aria-label={group.name}>
                  <h4 className={styles.rootGroupHeading}>{group.name} <span>{group.hits.length.toLocaleString("en")} occurrences</span></h4>
                  <div className={styles.rootTableScroll}>
                    <table className={styles.rootTable}>
                      <thead><tr><th scope="col">Location / word</th><th scope="col">English gloss</th><th scope="col">Arabic verse context</th></tr></thead>
                      <tbody>
                        {group.hits.slice(0, visibleCount).map(hit => {
                          const location = `${hit.reference}:${hit.index}`;
                          const morphologyUrl = `https://corpus.quran.com/wordmorphology.jsp?location=(${location})`;
                          // Re-render after batch completion; the gloss remains
                          // associated with the precise Qurʾānic word position.
                          void rootGlossRevision;
                          const wordGloss = rootGlossCache.current.get(hit.reference)?.[hit.index - 1]?.trim();
                          const glossLoaded = rootGlossCache.current.has(hit.reference);
                          return <tr key={location}>
                            <td className={styles.rootLocation}>
                              <a href={morphologyUrl} target="_blank" rel="noreferrer" title="Open corpus word morphology">({location}) ↗</a>
                              <em>{hit.romanized}</em>
                              <span dir="rtl" lang="ar">{hit.surface}</span>
                            </td>
                            <td className={styles.rootMeaning}>
                              <a href={morphologyUrl} target="_blank" rel="noreferrer"
                                title={`Open the source word analysis for ${location}`}>
                                {wordGloss || (glossLoaded ? "Gloss unavailable" : "Loading gloss…")} ↗
                              </a>
                            </td>
                            <td>
                              <button type="button" className={styles.rootVerseAction} onClick={() => openRootHit(hit)} aria-label={`Open Qur'an ${hit.reference}, word ${hit.index}`}>
                                {hit.context ? <span dir="rtl" lang="ar" className={styles.rootTableArabic}>
                                  {hit.context.before.join(" ")}{hit.context.before.length ? " " : ""}
                                  <mark>{hit.context.match}</mark>
                                  {hit.context.after.length ? " " : ""}{hit.context.after.join(" ")}
                                </span> : <span dir="rtl" lang="ar" className={styles.rootTableArabic}><mark>{hit.surface}</mark></span>}
                              </button>
                            </td>
                          </tr>;
                        })}
                      </tbody>
                    </table>
                  </div>
                  {visibleCount < group.hits.length && <button type="button" className={styles.moreResults} onClick={() => setRootGroupShown(previous => ({...previous, [group.name]: visibleCount + 50}))}>
                    Show next {Math.min(50, group.hits.length - visibleCount)} in {group.name} ({group.hits.length - visibleCount} remaining)
                  </button>}
                </section>;
              })}
              <p className={styles.hint}>Word forms and grammatical groups come from the Qurʾānic Arabic Corpus. English word glosses are linked to the source rather than inferred from a root meaning. Arabic context is shown only when word alignment is verified.</p>
            </div>}
            {rootTotal === 0 && <p role="status" className={styles.hint}>No annotated occurrences found for this root.</p>}
            <p className={styles.morphCredit}>Morphological annotations: <a href="https://corpus.quran.com" target="_blank" rel="noreferrer">Qurʾānic Arabic Corpus</a> v0.4, © Kais Dukes (2011). <a href="/data/quranic-corpus-morphology-0.4.zip">Original unmodified dataset and notices</a>. Annotation is analytical data, not Qurʾānic revelation.</p>
              </div>}
              {researchTab === 'analysis' && <>
          <div className={styles.tabBody}>
            <div className={styles.panelHeader}><h2>Detailed Analysis</h2><span>{publicMode
              ? publicAnalysis ? `Published ${publicAnalysis.reference} · v${publicAnalysis.version}` : publicLoadState === "loading" ? "Loading published analysis…" : publicLoadState === "missing" ? "Not published" : publicLoadState === "error" ? "Unable to load" : "Select a verse"
              : analysisReference && aiResponse ? `Analysis ${analysisReference}` : loading ? "Analysis in progress" : "No analysis yet"}</span></div>
            <div className={styles.selection}>
              {analysisVerse ? <span>Reader selection: {refOf(analysisVerse.chapter, analysisVerse.verse)}</span> : "Select a verse in the Reader."}
              {analysisReference && <span style={{ marginLeft: 12 }}> {loading ? "Streaming" : "Last analysis"}: {analysisReference}</span>}
            </div>
            {publicMode ? <>
              {publicLoadState === "loading" && <p role="status" className={styles.hint}>Loading published analysis…</p>}
              {publicLoadState === "missing" && <p role="status" className={styles.hint}>Detailed analysis for this verse has not yet been published.</p>}
              {publicLoadState === "error" && <p role="alert" className={styles.hint}>Unable to retrieve published analysis.</p>}
              {publicAnalysis && <div className={styles.answer} onClick={onAnalysisCitationClick}>
                <p className={styles.hint}>Published v{publicAnalysis.version} · {new Date(publicAnalysis.publishedAt).toLocaleDateString()}</p>
                <LinkedResearchAnalysis key={`published-${publicAnalysis.reference}-${publicAnalysis.version}`} source={publicAnalysis.content}/>
              </div>}
            </> : <>
            <p className={styles.hint}>Browse and search on the left without interrupting this analysis. A new request begins only when you press Analyze verse; Stop cancels it explicitly. Keep this browser tab open while streaming.</p>
            <label className={styles.label}>Private analysis passcode
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Set by site administrator" />
            </label>
            <div className={styles.note} style={{ marginBottom: 12 }}>
              <h3>Published analyses</h3>
              <p className={styles.hint}>Select a verse in the Reader, then load its published analysis into the editable workspace. The public version stays unchanged until you publish a revision.</p>
              <button type="button" className={styles.secondary}
                disabled={loading || publishing || publishedEditorLoading || !selectedPublicReference}
                onClick={() => void loadPublishedForEditing()}>
                {publishedEditorLoading ? "Loading published analysis…" : `Load published ${selectedPublicReference || "verse"} for editing`}
              </button>
              {publishedEditorStatus && <p role="status" className={styles.hint}>{publishedEditorStatus}</p>}
              {loadedPublishedVersion && <p className={styles.hint}>Editing a copy of published {loadedPublishedVersion.reference}, version {loadedPublishedVersion.version}. Save a draft to retain unpublished changes.</p>}
            </div>
            <button type="button" className={styles.primary} disabled={loading || publishing || publishedEditorLoading || !analysisVerse} onClick={analyze}>{loading ? `Analyzing ${analysisReference || "verse"}…` : `Run new analysis ${analysisVerse ? refOf(analysisVerse.chapter, analysisVerse.verse) : "(select verse)"}`}</button>
            {loading && <button type="button" className={styles.secondary} onClick={cancelAnalysis}>Stop analysis</button>}
            {status && <p role="status" className={styles.status}>{status}</p>}
            {evidenceAudit && <details className={styles.note}>
              <summary>Evidence audit: {evidenceAudit.references.length} comparison passages; {evidenceAudit.researchSources.length} restored research sections</summary>
              <p className={styles.hint}>These are search leads verified against the local Qurʾān, not independent proof of an article's conclusion. Evidence remains fixed across the analysis stages.</p>
              <p><strong>Focal verse:</strong> {evidenceAudit.focalReference || analysisReference}</p>
              <p><strong>Immediate context (full Arabic):</strong> {(evidenceAudit.contextReferences || []).join(", ")}</p>
              <p><strong>Additional full-Arabic comparisons:</strong> {evidenceAudit.references.join(", ")}</p>
              <p><strong>Restored indexed research sections:</strong></p>
              <ul>{evidenceAudit.researchSources.map(src => <li key={src.id}>{src.title} — {src.section} ({src.parts || 1} indexed parts; {src.complete ? "complete" : "truncated"})</li>)}</ul>
              <p><strong>Corpus lemma coverage:</strong></p>
              <ul>{evidenceAudit.lexical.map(entry => <li key={entry.lemma}>{entry.lemma}: {entry.supplied} / {entry.total} verse occurrences supplied in full</li>)}</ul>
            </details>}
            {argumentAudit && <details className={styles.note}>
              <summary>Argument reconstruction: {argumentAudit.claims.length} claim(s) tested before interpretation</summary>
              <p><strong>Issue:</strong> {argumentAudit.issue}</p>
              <ul>{argumentAudit.claims.map((item,i)=><li key={`argument-${i}`}><strong>{item.claim}</strong> ({item.status}; {item.source})
                {item.premises.length > 0 && <ul>{item.premises.map((premise,j)=><li key={`premise-${j}`}>{premise}</li>)}</ul>}
                <span>Evidence references: {item.evidenceRefs.join(", ") || "none verified"}</span>
              </li>)}</ul>
              {argumentAudit.disputed.length > 0 && <p><strong>Disputed:</strong> {argumentAudit.disputed.join(" · ")}</p>}
              {argumentAudit.notNecessarilyDisputed.length > 0 && <p><strong>Not automatically negated:</strong> {argumentAudit.notNecessarilyDisputed.join(" · ")}</p>}
            </details>}
            {unsuppliedReferences.length > 0 && <p role="status" className={styles.hint}>References mentioned without full Arabic in this analysis: {unsuppliedReferences.join(", ")}. These claims need separate verification.</p>}
            {aiResponse && <div className={styles.answer} onClick={onAnalysisCitationClick}><h3>Detailed analysis {analysisReference || ""}</h3>{incomplete && <p role="alert" className={styles.incomplete}>The analysis or verification may be incomplete (output limit or interrupted stream).</p>}<LinkedResearchAnalysis key={`private-${analysisReference}-${loading ? "streaming" : "complete"}`} source={cleanAnalysisText(aiResponse)} enabled={!loading}/>{auditReport && (auditReport.findings.length > 0 || auditReport.unresolved.length > 0) && <details><summary>Evidence review: {auditReport.findings.length} flagged issue(s), {auditReport.unresolved.length} unresolved item(s){auditReport.deterministicFindings !== undefined ? `; ${auditReport.deterministicFindings} corpus-backed grammar flag(s)` : ""}</summary><ul>{auditReport.findings.map((item, i) => <li key={`finding-${i}`}><strong>Review (not auto-applied):</strong> {item.issue} <span>Evidence {item.evidenceRef}: {item.evidenceQuote}</span> <span>Suggested revision: {item.suggestion}</span></li>)}{auditReport.unresolved.map((item, i) => <li key={`open-${i}`}>Unresolved: {item}</li>)}</ul></details>}</div>}
            <div className={styles.note} style={{ marginTop: 24 }}>
              <h3>Saved drafts</h3>
              <p className={styles.hint}>Drafts are private to this browser; they are not published and do not sync across devices. Select one to reopen and edit it.</p>
              {savedDrafts.length ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select aria-label="Choose a saved analysis draft" value={draftToOpen} onChange={event => setDraftToOpen(event.target.value)} style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <option value="">Select saved draft</option>
                  {savedDrafts.map(draft => <option key={draft.reference} value={draft.reference}>{draft.reference} — {new Date(draft.updatedAt).toLocaleString()}</option>)}
                </select>
                <button type="button" className={styles.secondary} disabled={!draftToOpen || loading} onClick={openPublicationDraft}>Open draft</button>
              </div> : <p className={styles.hint}>No saved drafts in this browser.</p>}
              {draftStatus && <p role="status" className={styles.hint}>{draftStatus}</p>}
            </div>
            {(aiResponse || publicationDraft) && <div className={styles.note} style={{ marginTop: 24 }}>
              <h3>Admin publication workflow</h3>
              <p className={styles.hint}>Review and edit the full analysis below. Approval publishes this exact text; model findings are not automatically corrected.</p>
              <label className={styles.label}>Publication draft
                <textarea style={{ width: "100%", minHeight: 320, fontFamily: "inherit" }} value={publicationDraft} onChange={e => { draftBeingEdited.current = true; setPublicationDraft(e.target.value); setPublicationApproved(false); setDraftStatus("Unsaved changes — select Save draft to retain them."); }} />
              </label>
              <label className={styles.label} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input type="checkbox" checked={publicationApproved} onChange={e => setPublicationApproved(e.target.checked)} />
                I have reviewed this exact analysis and approve it for public publication.
              </label>
              {auditReport && (auditReport.findings.length || auditReport.unresolved.length) ? <p className={styles.hint}>Verifier reports {auditReport.findings.length} finding(s) and {auditReport.unresolved.length} unresolved item(s). Resolve these before approving.</p> : null}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button type="button" className={styles.secondary} disabled={publishing || loading || !analysisReference || !publicationDraft.trim()} onClick={savePublicationDraft}>Save draft</button>
                <button type="button" className={styles.primary} disabled={publishing || loading || incomplete || !publicationApproved || !publicationDraft.trim()} onClick={publishAnalysis}>
                  {publishing ? "Publishing…" : `Publish ${analysisReference} to /publicquran`}
                </button>
              </div>
              {publicationStatus && <p role="status" className={styles.hint}>{publicationStatus}</p>}
            </div>}
            </>}
          </div>
              </>}
            </div>
          </section>
        </aside>
      </div>
      {creditsOpen && <div className={creditsStyles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) closeCredits(); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="ccc-credits-heading" className={creditsStyles.dialog}>
          <div className={creditsStyles.header}>
            <h2 id="ccc-credits-heading">Credits &amp; sources</h2>
            <button type="button" className={creditsStyles.close} aria-label="Close credits" onClick={closeCredits} autoFocus>×</button>
          </div>
          <div className={creditsStyles.body}>
            <p><strong>Arabic Qurʾān:</strong> Supplied by <a href="https://alquran.cloud/api" target="_blank" rel="noreferrer">Al Quran Cloud API</a> (Uthmani edition). Verify the provider’s text edition, accuracy, and rights before public production use. The reader does not modify the returned Arabic text.</p>
            <p><strong>Translations:</strong> Credited to their respective authors. The full 114-surah Urdu exposition is attributed to Amin Ahsan Islahi, <em>Tadabbur-e-Qurʾān</em> (user-supplied dataset). Translations are not authoritative Arabic text.</p>
            <p><strong>Audio:</strong> Streamed on demand from <a href="https://alquran.cloud" target="_blank" rel="noreferrer">Al Quran Cloud</a>, reciter <strong>ar.alafasy</strong>. Internet access is required. Verse audio and translation remain separate.</p>
          </div>
        </section>
      </div>}
    </main>
  );
}

export default function QuranPrivatePage() {
  return <QuranResearchPage />;
}
