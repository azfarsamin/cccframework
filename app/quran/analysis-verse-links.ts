/** Convert valid Qurʾānic verse citations in rendered research Markdown into
 * in-page Reader navigation anchors. No model changes or external links.
 * Code, existing links, HTML, and fenced blocks are left untouched.
 */
export const QURAN_AYAH_COUNTS = [
  7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
  112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,
  54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
  14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,
  29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,
  11,11,8,3,9,5,4,7,3,6,3,5,4,5,6
] as const;

export function validVerseReference(chapter: number, verse: number): boolean {
  return Number.isInteger(chapter) && Number.isInteger(verse) &&
    chapter >= 1 && chapter <= QURAN_AYAH_COUNTS.length &&
    verse >= 1 && verse <= QURAN_AYAH_COUNTS[chapter - 1];
}

// Retain already formatted Markdown syntax verbatim. An ordinary Markdown link
// is generated only from a bare citation; the renderer handles safe escaping.
const PROTECTED = /(`+[^`\n]*`+|!?\[[^\]\n]*\]\([^\)\n]*\)|<[^>\n]*>|https?:\/\/[^\s<>)]+|\b[\w.-]+@[\w.-]+\.[a-z]{2,})/gi;
const REFERENCE = /(?<![\w:/])([1-9]\d{0,2}):([1-9]\d{0,2})(?![\w:/])/g;

function linkPlainText(text: string): string {
  return text.replace(REFERENCE, (original, chapterText: string, verseText: string) => {
    const chapter = Number(chapterText);
    const verse = Number(verseText);
    if (!validVerseReference(chapter, verse)) return original;
    return `[${original}](#ccc-quran-ref-${chapter}-${verse})`;
  });
}

export function linkVerseReferencesInMarkdown(source: string): string {
  let fence: string | null = null;
  return source.split('\n').map(line => {
    const opening = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (opening) {
      const marker = opening[1];
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      return line;
    }
    if (fence || /^\s{0,3}\[[^\]]+\]:\s*\S+/.test(line)) return line;
    let output = '';
    let at = 0;
    for (const match of line.matchAll(PROTECTED)) {
      if (match.index === undefined) continue;
      output += linkPlainText(line.slice(at, match.index));
      output += match[0];
      at = match.index + match[0].length;
    }
    return output + linkPlainText(line.slice(at));
  }).join('\n');
}

export function parseReaderCitationHash(hash: string): {chapter:number; verse:number} | null {
  const match = /^#ccc-quran-ref-(\d{1,3})-(\d{1,3})$/.exec(hash);
  if (!match) return null;
  const chapter = Number(match[1]);
  const verse = Number(match[2]);
  return validVerseReference(chapter, verse) ? {chapter, verse} : null;
}
