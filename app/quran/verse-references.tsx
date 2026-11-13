import styles from "./quran.module.css";

type VerseReference = {
  title: string;
  author: string;
  description: string;
  url: string;
};

// Curated research references keyed to Qurʾānic verse. Add future notes here.
// These are scholarly references, not part of the Arabic revelation or translation.
const verseReferences: Record<string, VerseReference[]> = {
  "25:5": [
    {
      title: "Reassessing Prophetic Literacy and the Written Transmission of Revelation",
      author: "Azfar Samin (2026)",
      description: "Research on ٱكْتَتَبَهَا, prophetic literacy, and the written transmission of revelation.",
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
          <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.verseReferenceLink}>
            {item.title} ↗
          </a>
          <span className={styles.verseReferenceMeta}>{item.author}</span>
          <p className={styles.verseReferenceDescription}>{item.description}</p>
        </div>
      ))}
    </aside>
  );
}
