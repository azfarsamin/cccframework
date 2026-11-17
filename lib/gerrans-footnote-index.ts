/** Verse-targeted, attribution-preserving Gerrans footnotes. Research leads only, never Arabic corpus evidence. */
import indexed from "../research/index/sam-gerrans-complete-revelation-ed3-notes.json";
import verseMap from "../research/index/sam-gerrans-complete-revelation-ed3-verse-map.json";

export type GerransFootnote = {
  id:string; verse:string; surah:number; ayah:number; note_number:number;
  text:string; pdf_page_start:number; pdf_page_end:number;
  printed_page_start:number; printed_page_end:number;
  cross_references:string[]; author:string; sha256:string;
};
const noteById = new Map((indexed.notes as GerransFootnote[]).map(note => [note.id,note]));
const byVerse = verseMap.by_verse as Record<string,string[]>;
const byCitedVerse = verseMap.cited_in_notes as Record<string,string[]>;
export function gerransNotesForVerse(verse:string): GerransFootnote[] {
  return (byVerse[verse] || []).map(id => noteById.get(id)).filter((n):n is GerransFootnote => Boolean(n));
}
export function gerransNotesMentioningVerse(verse:string, limit=20): GerransFootnote[] {
  return (byCitedVerse[verse] || []).slice(0,Math.max(0,limit)).map(id => noteById.get(id)).filter((n):n is GerransFootnote => Boolean(n));
}
/** Full notes stay indexed. Live model context receives only complete notes fitting this budget. */
export function gerransPromptNotes(verse:string, maxNotes=3, maxChars=1800): string {
  const notes=gerransNotesForVerse(verse);
  const lines:string[]=[];let used=0;
  for(const note of notes){
    if(lines.length>=maxNotes) break;
    const header=`[Sam Gerrans, The Qur’an: A Complete Revelation, 3rd ed. (2022), Notes & Commentary, note ${note.verse}#${note.note_number}, printed p. ${note.printed_page_start}, PDF p. ${note.pdf_page_start}]`;
    const part=header+'\n'+note.text;
    if(used+part.length>maxChars) continue; // Never silently truncate the author's argument.
    lines.push(part);used+=part.length;
  }
  return lines.join('\n\n');
}
