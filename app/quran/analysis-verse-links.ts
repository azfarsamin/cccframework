/**
 * Verse-reference recognition for the rendered analysis. Do NOT inject Markdown
 * links into the source: the site's ResearchMarkdown view does not render them,
 * and nested citation brackets then become visible as raw text.
 *
 * Decoration is applied to actual DOM text nodes after React has rendered the
 * analysis. It does not alter quoted source text, existing links, code, or
 * canonical Qur'an text. For streaming output the caller waits for completion
 * before decorating, avoiding mutations to live React-managed text nodes.
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

export function parseReaderCitationHash(hash: string): {chapter:number; verse:number} | null {
  const match = /^#ccc-quran-ref-(\d{1,3})-(\d{1,3})$/.exec(hash);
  if (!match) return null;
  const chapter = Number(match[1]);
  const verse = Number(match[2]);
  return validVerseReference(chapter, verse) ? {chapter, verse} : null;
}

// Guard against references that are word indices, time stamps, URLs, or
// partial numbers. All candidate references are checked against surah lengths.
const REFERENCE = /(?<![\w:/])([1-9]\d{0,2}):([1-9]\d{0,2})(?![\w:/])/g;

// References bearing a biblical book name belong to that book, never the Qurʾān.
// Keep this narrowly scoped to the text immediately before the candidate number:
// "Deut. 18:15" is blocked, but a subsequent "Q 7:157" remains linkable.
const BIBLICAL_BOOK_BEFORE_REFERENCE = /(?:\b(?:Genesis|Gen\.?|Exodus|Exod\.?|Ex\.?|Leviticus|Lev\.?|Numbers|Num\.?|Deuteronomy|Deut\.?|Joshua|Josh\.?|Judges|Judg\.?|Ruth|Samuel|Sam\.?|Kings|Kgs\.?|Chronicles|Chron\.?|Chr\.?|Ezra|Nehemiah|Neh\.?|Esther|Est\.?|Job|Psalms?|Ps\.?|Proverbs|Prov\.?|Ecclesiastes|Eccl\.?|Song of Solomon|Song of Songs|Isaiah|Isa\.?|Jeremiah|Jer\.?|Lamentations|Lam\.?|Ezekiel|Ezek\.?|Daniel|Dan\.?|Hosea|Hos\.?|Joel|Amos|Obadiah|Obad\.?|Jonah|Micah|Mic\.?|Nahum|Nah\.?|Habakkuk|Hab\.?|Zephaniah|Zeph\.?|Haggai|Hag\.?|Zechariah|Zech\.?|Malachi|Mal\.?|Matthew|Matt\.?|Mt\.?|Mark|Mk\.?|Luke|Lk\.?|John|Jn\.?|Acts|Romans|Rom\.?|Corinthians|Cor\.?|Galatians|Gal\.?|Ephesians|Eph\.?|Philippians|Phil\.?|Colossians|Col\.?|Thessalonians|Thess\.?|Timothy|Tim\.?|Titus|Philemon|Phlm\.?|Hebrews|Heb\.?|James|Jas\.?|Peter|Pet\.?|Jude|Revelation|Rev\.?)(?:\s+\d)?\s*(?:chapter\s*)?)$/i;

export function isBiblicalCitationAt(text: string, referenceOffset: number): boolean {
  const before = text.slice(Math.max(0, referenceOffset - 70), referenceOffset);
  return BIBLICAL_BOOK_BEFORE_REFERENCE.test(before);
}

export function decorateRenderedVerseReferences(container: HTMLElement): number {
  const doc = container.ownerDocument;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || !node.textContent || !REFERENCE.test(node.textContent)) {
      REFERENCE.lastIndex = 0;
      continue;
    }
    REFERENCE.lastIndex = 0;
    if (parent.closest('a,code,pre,kbd,samp,script,style,textarea,button,input,[data-no-verse-links]')) continue;
    targets.push(node as Text);
  }
  let added = 0;
  for (const textNode of targets) {
    const text = textNode.textContent || '';
    const fragment = doc.createDocumentFragment();
    let cursor = 0;
    REFERENCE.lastIndex = 0;
    for (const match of text.matchAll(REFERENCE)) {
      const index = match.index ?? 0;
      const chapter = Number(match[1]);
      const verse = Number(match[2]);
      if (!validVerseReference(chapter, verse) || isBiblicalCitationAt(text, index)) continue;
      fragment.append(doc.createTextNode(text.slice(cursor, index)));
      const link = doc.createElement('a');
      link.href = `#ccc-quran-ref-${chapter}-${verse}`;
      link.className = 'ccc-analysis-verse-link';
      link.title = `Show Qurʾān ${chapter}:${verse} in the Reader`;
      link.textContent = match[0];
      link.style.textDecoration = 'underline';
      link.style.textUnderlineOffset = '0.13em';
      fragment.append(link);
      cursor = index + match[0].length;
      added++;
    }
    if (cursor) {
      fragment.append(doc.createTextNode(text.slice(cursor)));
      textNode.parentNode?.replaceChild(fragment, textNode);
    }
  }
  return added;
}
