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
const fallibilityArticle: VerseReference = {
  label: "On Muhammad's fallibility, see article",
  url: "https://forthefew1.substack.com/p/was-muhammad-infallible",
};

const shamsArticle: VerseReference = {
  label: "For an analysis of Surah Al-Shams, see article",
  url: "https://forthefew1.substack.com/p/surah-al-shams-the-sun-the-soul-and",
};

const akbarArticle: VerseReference = {
  label: "On Allāhu Akbar and Qurʾānic usage, see article",
  url: "https://forthefew1.substack.com/p/a-quranic-pan-textual-analysis-of",
};

const takbirArticle: VerseReference = {
  label: "On Qurʾānic takbīr and divine greatness, see article",
  url: "https://forthefew1.substack.com/p/a-quranic-pan-textual-analysis-of",
};

const verseReferences: Record<string, VerseReference[]> = {
  // Pan-textual study of Allāhu Akbar: direct lexical examples and divine names.
  "9:72": [akbarArticle],
  "29:45": [akbarArticle],
  "40:10": [akbarArticle],
  "6:78": [akbarArticle],
  "6:19": [akbarArticle],
  "9:3": [akbarArticle],
  "40:12": [akbarArticle],
  "4:34": [akbarArticle],
  "13:9": [akbarArticle],
  "22:62": [akbarArticle],
  "31:30": [akbarArticle],
  "34:23": [akbarArticle],
  // Commands to magnify God, rather than prescribing a fixed ritual phrase.
  "17:111": [takbirArticle],
  "74:3": [takbirArticle],
  "2:185": [takbirArticle],
  "22:37": [takbirArticle],
  "15:9": [
    {
      label: "See Chapter 3 for discussion on the preservation of the Qur'an",
      url: "https://www.cccframework.ca/pdfs/ReasonRevelationTruth_FreePdf_v2.0.pdf",
    },
  ],
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
  "65:4": [
    {
      label: "For the Prophet's marriage controversy with Ayeshah, see",
      url: "https://al-aasar.com/index.php/Journal/article/view/816/691",
    },
  ],
  "28:10": [
    {
      label: "See article on moral reasoning in the Qur'an",
      url: "https://forthefew1.substack.com/p/moral-reasoning-in-the-quran",
    },
  ],
  "22:46": [
    {
      label: "See article on moral reasoning in the Qur'an",
      url: "https://forthefew1.substack.com/p/moral-reasoning-in-the-quran",
    },
  ],
  "7:179": [
    {
      label: "See article on moral reasoning in the Qur'an",
      url: "https://forthefew1.substack.com/p/moral-reasoning-in-the-quran",
    },
  ],
  "22:52": [
    {
      label: "See article on the satanic verses",
      url: "https://forthefew1.substack.com/p/the-satanic-verses-a-quranic-diagnosis",
    },
  ],
  "17:73": [
    {
      label: "See article on the satanic verses",
      url: "https://forthefew1.substack.com/p/the-satanic-verses-a-quranic-diagnosis",
    },
    fallibilityArticle,
  ],
  "53:2": [
    {
      label: "See article on the satanic verses",
      url: "https://forthefew1.substack.com/p/the-satanic-verses-a-quranic-diagnosis",
    },
    fallibilityArticle,
  ],
  "53:3": [
    {
      label: "See article on the satanic verses",
      url: "https://forthefew1.substack.com/p/the-satanic-verses-a-quranic-diagnosis",
    },
  ],
  // Surah-wide article displayed at 91:1 using the existing verse-reference layout.
  "91:1": [shamsArticle],
  // Muhammad's fallibility: opening verses are used for multi-verse passages.
  "93:7": [fallibilityArticle],
  "6:35": [fallibilityArticle],
  "8:67": [fallibilityArticle],
  "9:43": [fallibilityArticle],
  "9:83": [fallibilityArticle],
  "66:1": [fallibilityArticle],
  "48:2": [fallibilityArticle],
  "80:1": [fallibilityArticle],
  "68:9": [fallibilityArticle],
  "33:37": [fallibilityArticle],
  "58:1": [fallibilityArticle],
  "33:53": [fallibilityArticle],
  "9:128": [fallibilityArticle],
  "33:40": [fallibilityArticle],
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
