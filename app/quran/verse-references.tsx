import styles from "./quran.module.css";

type VerseReference = {
  label: string;
  url: string;
};

// Curated research references keyed to Qurʾānic verse. Add future notes here.
// These are scholarly references, not part of the Arabic revelation or translation.
const ribaBook: VerseReference = {
  label: "See book on debt, money and interest",
  url: "https://www.cccframework.ca/pdfs/ArchitectureOfDebtMoneyAndInterest_freepdf.pdf",
};

// The Qurʾān contains eight occurrences of ribā across these six verses.
// One book reference per verse, even where the word occurs multiple times.
const verseReferences: Record<string, VerseReference[]> = {
  "2:275": [ribaBook],
  "2:276": [ribaBook],
  "2:278": [ribaBook],
  "3:130": [ribaBook],
  "4:161": [ribaBook],
  "30:39": [ribaBook],
  "25:5": [
    {
      label: "See article on prophetic literacy",
      url: "https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6748782",
    },
  ],
};

export function VerseReferences({ chapter, verse }: { chapter: number; verse: number }) {
  const references = verseReferences[`${chapter}:${verse}`];
  if (!references?.length) return null;

  return (
    <aside className={styles.verseReferences} aria-label={`Research references for ${chapter}:${verse}`}>
      <strong className={styles.verseReferencesHeading}>Research references</strong>
      {references.map((item) => (
        <div className={styles.verseReferenceItem} key={item.url}>
          <span>{item.label} <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.verseReferenceLink}>here</a>.</span>
        </div>
      ))}
    </aside>
  );
}
