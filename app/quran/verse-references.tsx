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
  label: "On Kabir, Allāhu Akbar and Qurʾānic usage, see article",
  url: "https://forthefew1.substack.com/p/a-quranic-pan-textual-analysis-of",
};

const takbirArticle: VerseReference = {
  label: "On Qurʾānic takbīr and divine greatness, see article",
  url: "https://forthefew1.substack.com/p/a-quranic-pan-textual-analysis-of",
};

const halalHaramArticle: VerseReference = {
  label: "On Qurʾānic ḥalāl and ḥarām, see article",
  url: "https://forthefew1.substack.com/p/halal-and-haram-a-quranic-perspective",
};

// The article URL was not present in the supplied article text. Set this to the
// verified Substack post URL when available; until then notes remain non-clickable.
const ummiArticleUrl = "";
const ummiMeaning: VerseReference = {
  label: "On ummī as unscriptured rather than illiterate, see article",
  url: ummiArticleUrl,
};
const ummiLiteracy: VerseReference = {
  label: "On prophetic literacy and written revelation, see article",
  url: ummiArticleUrl,
};
const ummiWriting: VerseReference = {
  label: "On ṣuḥuf, kitāb and written revelation, see article",
  url: ummiArticleUrl,
};

const verseReferences: Record<string, VerseReference[]> = {
  "3:3": [ummiWriting],

  "6:7": [ummiWriting],

  "87:19": [ummiWriting],

  "87:18": [ummiWriting],

  "74:52": [ummiWriting],

  "53:36": [ummiWriting],

  "20:133": [ummiWriting],

  "2:2": [ummiLiteracy],

  "98:2": [ummiLiteracy],

  "80:15": [ummiLiteracy],

  "80:13": [ummiLiteracy],

  "52:2": [ummiLiteracy],

  "29:48": [ummiLiteracy],

  "25:4": [ummiLiteracy],

  "62:2": [ummiMeaning],

  "7:158": [ummiMeaning],

  "7:157": [ummiMeaning],

  "3:75": [ummiMeaning],

  "3:20": [ummiMeaning],

  "2:78": [ummiMeaning],

  // Halāl and harām: divine authority, dietary limits, and messenger scope.
  "16:116": [halalHaramArticle],
  "10:59": [halalHaramArticle],
  "69:44": [halalHaramArticle],
  "5:87": [halalHaramArticle],
  "6:150": [halalHaramArticle],
  "16:114": [halalHaramArticle],
  "16:115": [halalHaramArticle],
  "6:145": [halalHaramArticle],
  "5:3": [halalHaramArticle],
  "6:118": [halalHaramArticle],
  "6:119": [halalHaramArticle],
  "6:121": [halalHaramArticle],
  "2:168": [halalHaramArticle],
  "3:93": [halalHaramArticle],
  "4:160": [halalHaramArticle],
  "6:146": [halalHaramArticle],
  "6:138": [halalHaramArticle],
  "6:143": [halalHaramArticle],
  "10:15": [halalHaramArticle],
  "46:9": [halalHaramArticle],
  "7:32": [halalHaramArticle],
  "5:4": [halalHaramArticle],
  "18:18": [halalHaramArticle],
  "18:22": [halalHaramArticle],
  "39:18": [halalHaramArticle],
  // Pan-textual study of Kabir, Allāhu Akbar, and Qurʾānic usage.
  "9:72": [akbarArticle],
  "29:45": [akbarArticle],
  "40:10": [akbarArticle],
  "6:78": [akbarArticle],
  "6:19": [akbarArticle],
  "9:3": [akbarArticle],
  "40:12": [akbarArticle],
  "4:34": [
    akbarArticle,
    {
      label: "For a treatment of the word ḍaraba, see this three-part article series",
      url: "https://forthefew1.substack.com/p/the-calibration-problem-the-misuse-b3b",
    },
  ],
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
    ummiLiteracy,
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
  "66:1": [fallibilityArticle, halalHaramArticle],
  "48:2": [fallibilityArticle],
  "80:1": [fallibilityArticle],
  "68:9": [fallibilityArticle],
  "33:37": [fallibilityArticle],
  "58:1": [fallibilityArticle],
  "33:53": [fallibilityArticle],
  "9:128": [fallibilityArticle],
  "33:40": [fallibilityArticle],
};

// Verse-linked qirāʾāt comparisons. These are kept distinct from research references.
// A separate record allows other variants to be added without changing verse data.
type VariantReading = {
  hafsArabic: string;
  hafsMeaning: string;
  warshArabic: string;
  warshMeaning: string;
  source: string;
};

const variantReadings: Record<string, VariantReading> = {
  "43:19": {
    hafsArabic: "عِبَٰدُ ٱلرَّحْمَٰنِ",
    hafsMeaning: "servants of the Most Merciful",
    warshArabic: "عِندَ ٱلرَّحْمَٰنِ",
    warshMeaning: "with the Most Merciful",
    source: "https://quran.com/43:19/qiraat",
  },
  "2:259": {
    hafsArabic: "نُنْشِزُهَا",
    hafsMeaning: "We raise/reassemble the bones",
    warshArabic: "نُنْشِرُهَا",
    warshMeaning: "We revive the bones",
    source: "https://quran.com/2:259/qiraat",
  },
};

// An alternative vocalization, not a claim of a Ḥafṣ–Warsh variant.
// Unvowelled rasm is the same in both readings of 30:2.
const alternativeVocalizations: Record<string, { note: string }> = {
  "30:2": {
    note: "Sam Gerrans reads غَلَبَتِ (ghalabat, active: ‘the Romans prevailed’) rather than غُلِبَتِ (ghulibat, passive: ‘the Romans were defeated’). The consonantal rasm is unchanged.",
  },
};

export function VerseReferences({ chapter, verse }: { chapter: number; verse: number }) {
  const key = `${chapter}:${verse}`;
  const references = verseReferences[key] ?? [];
  const variant = variantReadings[key];
  const vocalization = alternativeVocalizations[key];
  if (references.length === 0 && !variant && !vocalization) return null;

  return (
    <aside className={styles.verseReferences} aria-label={`References and variant readings for ${key}`}>
      {variant && (
        <div className={styles.verseReferenceItem}>
          <strong className={styles.verseReferencesHeading}>Variant readings</strong>{" "}
          <span>
            Ḥafṣ: <b lang="ar" dir="rtl">{variant.hafsArabic}</b> ({variant.hafsMeaning});{" "}
            Warsh: <b lang="ar" dir="rtl">{variant.warshArabic}</b> ({variant.warshMeaning}).{" "}
            <a href={variant.source} target="_blank" rel="noopener noreferrer" className={styles.verseReferenceLink}>Source</a>.
          </span>
        </div>
      )}
      {vocalization && (
        <div className={styles.verseReferenceItem}>
          <strong className={styles.verseReferencesHeading}>Alternative vocalization</strong>{" "}
          <span>{vocalization.note}</span>
        </div>
      )}
      {references.length > 0 && (
        <>
          <strong className={styles.verseReferencesHeading}>Research references</strong>
          {references.map((item, index) => (
            <div className={styles.verseReferenceItem} key={`${key}-${index}-${item.url}`}>
              <span>{item.label}{item.url ? <> <a href={item.url} target="_blank" rel="noopener noreferrer" className={styles.verseReferenceLink}>here</a>.</> : <> (link pending).</>}</span>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}
