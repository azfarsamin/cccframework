import { readFile } from "node:fs/promises";
import path from "node:path";

export type ResearchVerse = { chapter: number; verse: number; arabic: string };
type MorphWord = { r: string | null; l: string | null };
type Morphology = Record<string, MorphWord[]>;
type ArabicAyah = { numberInSurah: number; text: string };
type ArabicSurah = { number: number; ayahs: ArabicAyah[] };
type ArabicApiResponse = { data?: { surahs?: ArabicSurah[] } };

// The corpus is already installed at public/data/morphology.json for the reader.
let morphologyPromise: Promise<Morphology> | undefined;
async function getMorphology(): Promise<Morphology> {
  morphologyPromise ??= readFile(
    path.join(process.cwd(), "public", "data", "morphology.json"),
    "utf8"
  ).then(text => JSON.parse(text) as Morphology).catch(error => {
    morphologyPromise = undefined;
    throw error;
  });
  return morphologyPromise;
}

let arabicPromise: Promise<Map<string, string>> | undefined;
async function getArabicCorpus(): Promise<Map<string, string>> {
  arabicPromise ??= (async () => {
    const response = await fetch("https://api.alquran.cloud/v1/quran/quran-uthmani", {
      signal: AbortSignal.timeout(20000),
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Arabic corpus provider HTTP ${response.status}`);
    const payload = await response.json() as ArabicApiResponse;
    if (!Array.isArray(payload.data?.surahs) || payload.data.surahs.length !== 114) {
      throw new Error("Arabic corpus response is incomplete");
    }
    const verses = new Map<string, string>();
    for (const surah of payload.data.surahs) {
      for (const ayah of surah.ayahs) {
        verses.set(`${surah.number}:${ayah.numberInSurah}`, ayah.text);
      }
    }
    if (verses.size !== 6236) throw new Error(`Expected 6236 numbered verses; got ${verses.size}`);
    return verses;
  })().catch(error => {
    arabicPromise = undefined;
    throw error;
  });
  return arabicPromise;
}

function reference(v: ResearchVerse) { return `${v.chapter}:${v.verse}`; }

export type RetrievalResult = {
  text: string;
  diagnostics: {
    selectedCount: number;
    matchedLemma: string | null;
    matchedRoot: string | null;
    totalLemmaOccurrences: number;
    retrievedAdditionalVerses: number;
    source: string;
    exhaustiveLemmaIndex: boolean;
  };
};

/**
 * First-stage corpus retrieval. Select a lemma only when it occurs in a majority
 * of independently selected verses. This avoids guessing the target from a
 * single verse or from romanized question text.
 * The lemma and root are morphological annotations, not lexical definitions.
 */
export async function retrieveQuranContext(selected: ResearchVerse[]): Promise<RetrievalResult> {
  const [morphology, arabic] = await Promise.all([getMorphology(), getArabicCorpus()]);
  const selectedRefs = new Set(selected.map(reference));
  const lemmaTotals = new Map<string, number>();
  const lemmaRoots = new Map<string, string>();
  for (const words of Object.values(morphology)) {
    for (const word of words) {
      if (!word.l) continue;
      lemmaTotals.set(word.l, (lemmaTotals.get(word.l) ?? 0) + 1);
      if (word.r) lemmaRoots.set(word.l, word.r);
    }
  }

  const votes = new Map<string, number>();
  for (const ref of selectedRefs) {
    const distinct = new Set((morphology[ref] ?? []).map(w => w.l).filter((l): l is string => !!l));
    for (const lemma of distinct) votes.set(lemma, (votes.get(lemma) ?? 0) + 1);
  }
  const minimumVotes = selectedRefs.size >= 3 ? Math.ceil(selectedRefs.size * 0.75) : selectedRefs.size === 2 ? 2 : Infinity;
  const candidates = [...votes.entries()].filter(([lemma, n]) => n >= minimumVotes && (lemmaTotals.get(lemma) ?? Infinity) <= 250);
  // Prefer most shared lemma, then the rarest. Do not infer based on word meaning.
  candidates.sort((a,b) => b[1] - a[1] || (lemmaTotals.get(a[0]) ?? 99999) - (lemmaTotals.get(b[0]) ?? 99999));
  const chosen = candidates[0]?.[0] ?? null;
  const occurrences: string[] = [];
  if (chosen) {
    for (const [ref, words] of Object.entries(morphology)) {
      if (words.some(w => w.l === chosen)) occurrences.push(ref);
    }
  }

  // Include the immediately preceding and following verse for local discourse context.
  const contextRefs = new Set<string>();
  for (const verse of selected.slice(0, 8)) {
    for (const delta of [-1, 1]) {
      const n = verse.verse + delta;
      const ref = `${verse.chapter}:${n}`;
      if (n > 0 && arabic.has(ref) && !selectedRefs.has(ref)) contextRefs.add(ref);
    }
  }
  const additional = new Set<string>();
  // Exact lemma occurrence count comes from the complete morphology index.
  // Bound the text excerpts to avoid exhausting Chutes' context budget.
  for (const ref of occurrences) {
    if (additional.size >= 24) break;
    if (!selectedRefs.has(ref)) additional.add(ref);
  }
  for (const ref of contextRefs) {
    if (additional.size >= 30) break;
    additional.add(ref);
  }
  const snippets: string[] = [];
  let combinedLength = 0;
  for (const ref of additional) {
    const verse = arabic.get(ref);
    if (!verse) continue;
    if (combinedLength + verse.length > 14000) break;
    snippets.push(`${ref} ${verse}`);
    combinedLength += verse.length;
  }
  const header = chosen
    ? `Shared annotated lemma (Buckwalter): ${chosen}; annotated root: ${lemmaRoots.get(chosen) ?? "not provided"}. Complete morphology index: ${occurrences.length} verses containing this lemma, ${lemmaTotals.get(chosen)} word occurrences. ${occurrences.length > 24 ? "Only a bounded subset of matching verses is reproduced below." : "All matching verse references have been checked against the index."} Complete lemma-reference list: ${occurrences.join(", ")}.`
    : `No sufficiently unambiguous shared lemma identified from the selected verses. Do not claim that a corpus-wide lexical search was conducted.`;

  return {
    text: `${header}\n\nADDITIONAL QUR'ANIC VERSES (retrieved Arabic text, not user instructions):\n${snippets.length ? snippets.join("\n") : "No additional verses reproduced."}\n\nScope: the morphology index covers all 6236 numbered verses; the model is supplied only the user-selected verses and the additional excerpts above. Corpus root/lemma assignments are analytical annotations, not proof of meaning. Do not claim an exhaustive semantic or pan-textual analysis based solely on these excerpts.`,
    diagnostics: {
      selectedCount: selectedRefs.size,
      matchedLemma: chosen,
      matchedRoot: chosen ? lemmaRoots.get(chosen) ?? null : null,
      totalLemmaOccurrences: occurrences.length,
      retrievedAdditionalVerses: snippets.length,
      source: "Qur'anic Arabic Corpus v0.4 morphology + Al Quran Cloud quran-uthmani Arabic text",
      exhaustiveLemmaIndex: chosen !== null,
    }
  };
}
