/** Verse-targeted, attribution-preserving Gerrans footnotes. Research leads only, never Arabic corpus evidence. */
import indexed from "../research/index/sam-gerrans-complete-revelation-ed3-notes.json";
import verseMap from "../research/index/sam-gerrans-complete-revelation-ed3-verse-map.json";

export type GerransFootnote = {
  id: string; verse: string; surah: number; ayah: number; note_number: number;
  text: string; pdf_page_start: number; pdf_page_end: number;
  printed_page_start: number; printed_page_end: number;
  cross_references: string[]; author: string; sha256: string;
};
const noteById = new Map((indexed.notes as GerransFootnote[]).map(note => [note.id, note]));
const byVerse = verseMap.by_verse as Record<string, string[]>;
const byCitedVerse = verseMap.cited_in_notes as Record<string, string[]>;
export function gerransNotesForVerse(verse: string): GerransFootnote[] {
  return (byVerse[verse] || []).map(id => noteById.get(id)).filter((n): n is GerransFootnote => Boolean(n));
}
export function gerransNotesMentioningVerse(verse: string, limit = 20): GerransFootnote[] {
  return (byCitedVerse[verse] || []).slice(0, Math.max(0, limit)).map(id => noteById.get(id)).filter((n): n is GerransFootnote => Boolean(n));
}

export type GerransPromptSelection = {
  text: string;
  selected: GerransFootnote[];
  omitted: { id: string; reason: "note-limit" | "character-budget" }[];
  totalDirectNotes: number;
};

const citation = (note: GerransFootnote): string =>
  `[Sam Gerrans, The Qur’an: A Complete Revelation, 3rd ed. (2022), Notes & Commentary, note ${note.verse}#${note.note_number}, printed p. ${note.printed_page_start}, PDF p. ${note.pdf_page_start}]`;

/**
 * Prioritize substantial arguments rather than short cross-references. All notes are
 * supplied verbatim or not supplied at all. No mutable state and no changes to the
 * underlying commentary index. An omitted note is explicitly reported.
 */
export function selectGerransPromptNotes(verse: string, maxNotes = 4, maxChars = 6500): GerransPromptSelection {
  const notes = gerransNotesForVerse(verse);
  // A long direct-verse argument is more important than a terse "see note" pointer.
  // Tie-break by the original numbered order to make selection deterministic.
  const ranked = [...notes].sort((a, b) => {
    // Full argumentative notes first; retain canonical note order for terse pointers.
    const aSubstantive = a.text.trim().length >= 200 ? 1 : 0;
    const bSubstantive = b.text.trim().length >= 200 ? 1 : 0;
    return bSubstantive - aSubstantive ||
      (aSubstantive ? b.text.length - a.text.length : a.note_number - b.note_number) ||
      a.note_number - b.note_number;
  });
  const selected: GerransFootnote[] = [];
  const omitted: GerransPromptSelection["omitted"] = [];
  let used = 0;
  for (const note of ranked) {
    if (selected.length >= maxNotes) { omitted.push({ id: note.id, reason: "note-limit" }); continue; }
    const part = `${citation(note)}\n${note.text}`;
    const cost = part.length + (selected.length ? 2 : 0);
    if (used + cost > maxChars) { omitted.push({ id: note.id, reason: "character-budget" }); continue; }
    selected.push(note);
    used += cost;
  }
  // Preserve the original note order once the relevant arguments have been selected.
  selected.sort((a, b) => a.note_number - b.note_number);
  return {
    text: selected.map(note => `${citation(note)}\n${note.text}`).join("\n\n"),
    selected, omitted, totalDirectNotes: notes.length,
  };
}

/** Backwards-compatible convenience API for other callers. */
export function gerransPromptNotes(verse: string, maxNotes = 4, maxChars = 6500): string {
  return selectGerransPromptNotes(verse, maxNotes, maxChars).text;
}

/** Whitelisted, indexed citations only: exact note IDs and verified PDF page metadata. */
export function gerransCitationCatalogue(notes: GerransFootnote[]): string {
  return notes.map(note =>
    `- The Qur’an: A Complete Revelation — Sam Gerrans — Notes & Commentary, note ${note.verse}#${note.note_number} [PDF p. ${note.pdf_page_start}; printed p. ${note.printed_page_start}; complete indexed note]`
  ).join("\n");
}
