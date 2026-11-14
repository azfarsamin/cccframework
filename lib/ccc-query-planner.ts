/** Query planning is pure: no language model and no network side effects. */
export type VerseRef = { chapter: number; verse: number };
export type QueryPlan =
  | { kind: "verse"; refs: VerseRef[]; analysis: boolean; scope: "exact" }
  | { kind: "phrase"; label: string; lemmas: string[]; analysis: boolean; expand: boolean; scope: "exact-phrase" }
  | { kind: "lemma"; label: string; lemma: string; analysis: boolean; scope: "exact-lemma" }
  | { kind: "root"; label: string; root: string; analysis: boolean; scope: "exact-root" }
  | { kind: "semantic"; analysis: boolean; scope: "conceptual" };

const ANALYSIS = /\b(what\s+does(?:\s+the)?\s+qur[’']?an\s+say|what\s+is|what\s+are|explain|analy[sz](?:e|ing|ed|is)|interpret|compare|evaluate|meaning|why|how|contradict|coheren|calibrat|correspond|argue|discuss|relationship|significance|context)\b/i;
const LIST = /\b(list|show|give|provide|find|identify|enumerate|where|occurrences?|references?|verses?|mention(?:s|ed)?|all|every|count)\b/i;
const NAMED = /\b(companions?|people|children|sons|dwellers|inhabitants|tribe|community|nation|family)\b/i;
const ARABIC = /[\u0600-\u06FF]/;
// A transparent, extensible lexical alias registry. Entries map an English
// conventional expression to exact annotated Arabic lemmas; they do not
// supply theological interpretations or invented verse associations.
export const PHRASE_ALIASES: ReadonlyArray<{ pattern: RegExp; label: string; lemmas: string[]; narrative?: boolean }> = [
  { pattern: /\b(?:children|sons)\s+of\s+israel\b|\bbani?\s+isra(?:e|')?il\b/i, label: "Children of Israel (بني إسرائيل)", lemmas: ["bunaY~", "<isoraA}iyl"] },
  { pattern: /\bcompanions?\s+of\s+the\s+(?:wood|thicket)\b|\b(?:people|dwellers)\s+of\s+the\s+(?:wood|thicket)\b|\ba[ṣs]ḥāb\s+al[- ]?ayka/i, label: "Companions of the Wood (أصحاب الأيكة)", lemmas: [">aSoHa`b", ">ayokap"], narrative: true },
  { pattern: /\b(?:people|folk)\s+of\s+the\s+book\b|\bahl\s+al[- ]?kit[aā]b\b/i, label: "People of the Book (أهل الكتاب)", lemmas: [">ahol", "kita`b"] },
  { pattern: /\bcompanions?\s+of\s+the\s+cave\b|\bpeople\s+of\s+the\s+cave\b/i, label: "Companions of the Cave (أصحاب الكهف)", lemmas: [">aSoHa`b", "kahof"], narrative: true },
  { pattern: /\bcompanions?\s+of\s+the\s+(?:fire|hellfire)\b/i, label: "Companions of the Fire (أصحاب النار)", lemmas: [">aSoHa`b", "naAr"] },
  { pattern: /\bcompanions?\s+of\s+the\s+(?:garden|paradise)\b/i, label: "Companions of the Garden (أصحاب الجنة)", lemmas: [">aSoHa`b", "jan~ap"] },
  { pattern: /\b(?:children|sons)\s+of\s+adam\b|\bbani?\s+adam\b/i, label: "Children of Adam (بني آدم)", lemmas: ["bunaY~", "A^dam"] },
  { pattern: /\bfamily\s+of\s+imr[aā]n\b|\b[aā]l\s+imr[aā]n\b/i, label: "Family of ʿImrān (آل عمران)", lemmas: ["'aAl", "Eimora`n"] },
  { pattern: /\bcompanions?\s+of\s+the\s+(?:town|village)\b/i, label: "Companions of the Town (أصحاب القرية)", lemmas: [">aSoHa`b", "qaroyap"], narrative: true },
];
export const LEMMA_ALIASES: ReadonlyArray<{ pattern: RegExp; label: string; lemma: string }> = [
  { pattern: /\bwisdom\b|\b(?:ḥikmah|hikmah|hikmat)\b|حكمة|الحكمة/i, label: "ḥikmah (حكمة)", lemma: "Hikomap" },
];
const CHAPTER_MAX = 114;
const REF = /(?:^|[^\p{L}\d])(?:qur[’']?an\s*)?(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3}))?/giu;

export function parseVerseReferences(question: string): { refs: VerseRef[]; invalid?: string } {
  const refs: VerseRef[] = [];
  const seen = new Set<string>();
  for (const m of question.matchAll(REF)) {
    const chapter = Number(m[1]);
    const first = Number(m[2]);
    const lastChapter = m[3] ? Number(m[3]) : chapter;
    const lastVerse = m[4] ? Number(m[4]) : first;
    if (chapter < 1 || chapter > CHAPTER_MAX || lastChapter !== chapter || first < 1 || lastVerse < first || lastVerse > 286)
      return { refs: [], invalid: `Invalid or unsupported verse range: ${m[0].trim()}` };
    if (lastVerse - first > 285) return { refs: [], invalid: "Verse range exceeds maximum of 286 verses" };
    for (let v = first; v <= lastVerse; v++) {
      const id = `${chapter}:${v}`;
      if (!seen.has(id)) { refs.push({ chapter, verse: v }); seen.add(id); }
    }
  }
  return { refs };
}
export function planQuranQuery(question: string): QueryPlan {
  const q = question.normalize("NFKC");
  const analysis = ANALYSIS.test(q);
  const parsed = parseVerseReferences(q);
  // Reference selection takes priority over vague subject terms.  Question text
  // that explicitly asks for analysis will still receive the exact evidence.
  if (parsed.refs.length) return { kind: "verse", refs: parsed.refs, analysis, scope: "exact" };
  for (const alias of PHRASE_ALIASES) if (alias.pattern.test(q)) {
    return { kind: "phrase", label: alias.label, lemmas: alias.lemmas,
      analysis, expand: Boolean(alias.narrative && (!/\boccurrences?\b/i.test(q) || analysis)), scope: "exact-phrase" };
  }
  if (LIST.test(q) || analysis) for (const alias of LEMMA_ALIASES) if (alias.pattern.test(q)) {
    return { kind: "lemma", label: alias.label, lemma: alias.lemma, analysis, scope: "exact-lemma" };
  }
  const explicitRoot = /(?:\broot\s+|جذر\s*)([\u0621-\u064A]{3,5})/.exec(q);
  if (explicitRoot) return { kind: "root", label: explicitRoot[1], root: explicitRoot[1], analysis, scope: "exact-root" };
  // Generic Arabic multiword phrase: exact token matching requires a morphology
  // mapping and must not be guessed from a translated or undiacritized string.
  if (ARABIC.test(q) && NAMED.test(q)) return { kind: "semantic", analysis, scope: "conceptual" };
  return { kind: "semantic", analysis, scope: "conceptual" };
}
export function isRetrievalOnly(question: string, plan: QueryPlan): boolean {
  return plan.kind !== "semantic" && !plan.analysis;
}
