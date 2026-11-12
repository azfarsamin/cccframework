"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./quran.module.css";

type Surah = { number: number; name: string; englishName: string; numberOfAyahs: number };
type Ayah = { numberInSurah: number; text: string };
type QuranResponse<T> = { code: number; data: T };
type TranslationEdition = "en.asad" | "en.sahih" | "en.yusufali" | "en.pickthall" | "en.itani" | "gerrans";
const editions: { id: TranslationEdition; name: string }[] = [
  { id: "en.asad", name: "Muhammad Asad" },
  { id: "en.sahih", name: "Saheeh International" },
  { id: "en.yusufali", name: "Abdullah Yusuf Ali" },
  { id: "en.pickthall", name: "Marmaduke Pickthall" },
  { id: "en.itani", name: "Talal Itani" },
  { id: "gerrans", name: "Sam Gerrans" },
];
type GerransMap = Record<string, string>;
type FullSurah = { number: number; ayahs: Ayah[] };
type SearchResult = { chapter: number; verse: number; arabic: string; english: string };
const MAX_SEARCH_RESULTS = 100;

function normalizeArabic(value: string) {
  return value.normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");
}

type Note = { id: string; reference: string; question: string; response: string; created: string };

function refOf(chapter: number, verse: number) { return `${chapter}:${verse}`; }
function storageRead(): Note[] {
  try { return JSON.parse(localStorage.getItem("ccc-quran-notes-v1") || "[]") as Note[]; }
  catch { return []; }
}

export default function QuranResearchPage() {
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [chapter, setChapter] = useState(19);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [edition, setEdition] = useState<TranslationEdition>("en.asad");
  const [translations, setTranslations] = useState<Ayah[]>([]);
  const [gerrans, setGerrans] = useState<GerransMap>({});
  const [translationError, setTranslationError] = useState("");
  const [selected, setSelected] = useState<number[]>([28]);
  const [search, setSearch] = useState("");
  const [verseReference, setVerseReference] = useState("");
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalLanguage, setGlobalLanguage] = useState<"arabic" | "english">("arabic");
  const [globalResults, setGlobalResults] = useState<SearchResult[]>([]);
  const [globalTotal, setGlobalTotal] = useState<number | null>(null);
  const [globalShown, setGlobalShown] = useState(MAX_SEARCH_RESULTS);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [globalError, setGlobalError] = useState("");
  const arabicCorpus = useRef<FullSurah[] | null>(null);
  const englishCorpus = useRef<Record<string, FullSurah[]>>({});

  const [jumpError, setJumpError] = useState("");
  const pendingJump = useRef<{ chapter: number; verse: number } | null>(null);
  const scrollTarget = useRef<string | null>(null);
  const [question, setQuestion] = useState("Analyze the selected verse(s) through coherence, correspondence, and calibration. Distinguish explicit statements from inference. Do not import hadith or biblical chronology as unquestioned premises.");
  const [password, setPassword] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { setNotes(storageRead());
    fetch("https://api.alquran.cloud/v1/surah")
      .then((r) => { if (!r.ok) throw new Error("Surah list unavailable"); return r.json(); })
      .then((j: QuranResponse<Surah[]>) => setSurahs(j.data))
      .catch(() => setStatus("Could not load the surah list. Check network access."));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setAyahs([]); setSelected([]); setAiResponse("");
    fetch(`https://api.alquran.cloud/v1/surah/${chapter}/quran-uthmani`)
      .then((r) => { if (!r.ok) throw new Error("Unable to fetch Arabic text"); return r.json(); })
      .then((j: QuranResponse<{ ayahs: Ayah[] }>) => { if (!cancelled) {
        setAyahs(j.data.ayahs);
        setStatus("");
        if (pendingJump.current?.chapter === chapter) {
          const verse = pendingJump.current.verse;
          if (verse <= j.data.ayahs.length) {
            setSelected([verse]);
            scrollTarget.current = refOf(chapter, verse);
          } else {
            setJumpError(`Surah ${chapter} has only ${j.data.ayahs.length} verses.`);
          }
          pendingJump.current = null;
        }
      } })
      .catch(() => { if (!cancelled) setStatus("Unable to load Arabic text from the data provider."); });
    return () => { cancelled = true; };
  }, [chapter]);

  useEffect(() => {
    let cancelled = false;
    setTranslations([]);
    setTranslationError("");
    if (edition === "gerrans") {
      fetch("/data/gerrans.json")
        .then(r => { if (!r.ok) throw new Error("Gerrans data not installed yet"); return r.json(); })
        .then((data: GerransMap) => {
          if (!cancelled) {
            if (!data || Array.isArray(data) || typeof data !== "object") throw new Error("Gerrans data is not in the expected verse-map format");
            setGerrans(data);
          }
        })
        .catch(() => { if (!cancelled) setTranslationError("Gerrans is available for download from Quranite Reader; the data file still needs to be installed in this website."); });
    } else {
      fetch(`https://api.alquran.cloud/v1/surah/${chapter}/${edition}`)
        .then(r => { if (!r.ok) throw new Error("Translation unavailable"); return r.json(); })
        .then((j: QuranResponse<{ ayahs: Ayah[] }>) => { if (!cancelled) setTranslations(j.data.ayahs); })
        .catch(() => { if (!cancelled) setTranslationError("Translation could not be loaded. Try another edition."); });
    }
    return () => { cancelled = true; };
  }, [chapter, edition]);

  const visible = useMemo(() => {
    const q = search.trim();
    return q ? ayahs.filter(a => a.text.includes(q) || String(a.numberInSurah) === q || refOf(chapter, a.numberInSurah) === q) : ayahs;
  }, [ayahs, search, chapter]);
  useEffect(() => {
    if (!scrollTarget.current) return;
    const id = scrollTarget.current;
    const target = document.getElementById(`ccc-verse-${id.replace(":", "-")}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      scrollTarget.current = null;
    }
  }, [ayahs, search, selected]);

  function jumpToVerse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setJumpError("");
    const match = verseReference.trim().match(/^(\d{1,3})\s*:\s*(\d{1,3})$/);
    if (!match) {
      setJumpError("Enter a reference like 19:28 (surah:verse).");
      return;
    }
    const targetChapter = Number(match[1]);
    const targetVerse = Number(match[2]);
    if (targetChapter < 1 || targetChapter > 114 || targetVerse < 1) {
      setJumpError("Enter a valid surah (1–114) and verse number.");
      return;
    }
    const surah = surahs.find(s => s.number === targetChapter);
    if (surah && targetVerse > surah.numberOfAyahs) {
      setJumpError(`Surah ${targetChapter} has only ${surah.numberOfAyahs} verses.`);
      return;
    }
    setSearch(String(targetVerse));
    scrollTarget.current = refOf(targetChapter, targetVerse);
    if (chapter === targetChapter && ayahs.some(a => a.numberInSurah === targetVerse)) {
      setSelected([targetVerse]);
    } else {
      pendingJump.current = { chapter: targetChapter, verse: targetVerse };
      setChapter(targetChapter);
    }
  }

  async function getFullCorpus(editionId: string): Promise<FullSurah[]> {
    const endpoint = `https://api.alquran.cloud/v1/quran/${editionId}`;
    const res = await fetch(endpoint);
    if (!res.ok) throw new Error(`Cannot load ${editionId} corpus (HTTP ${res.status}).`);
    const payload: QuranResponse<{ surahs: FullSurah[] }> = await res.json();
    if (!Array.isArray(payload?.data?.surahs) || payload.data.surahs.length !== 114) {
      throw new Error(`Invalid or incomplete ${editionId} corpus.`);
    }
    return payload.data.surahs;
  }

  async function searchWholeQuran(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = globalQuery.trim();
    setGlobalError("");
    setGlobalResults([]);
    setGlobalTotal(null);
    setGlobalShown(MAX_SEARCH_RESULTS);
    if (!query) { setGlobalError("Enter a keyword to search."); return; }
    setGlobalLoading(true);
    try {
      if (!arabicCorpus.current) arabicCorpus.current = await getFullCorpus("quran-uthmani");
      let translationVerses: FullSurah[] | null = null;
      let gerransMap: GerransMap | null = null;
      if (globalLanguage === "english") {
        if (edition === "gerrans") {
          if (Object.keys(gerrans).length) gerransMap = gerrans;
          else {
            const res = await fetch("/data/gerrans.json");
            if (!res.ok) throw new Error("Gerrans translation file is missing: public/data/gerrans.json");
            gerransMap = await res.json() as GerransMap;
            setGerrans(gerransMap);
          }
        } else {
          if (!englishCorpus.current[edition]) englishCorpus.current[edition] = await getFullCorpus(edition);
          translationVerses = englishCorpus.current[edition];
        }
      }
      const normalizedQuery = globalLanguage === "arabic" ? normalizeArabic(query) : query.toLocaleLowerCase();
      const hits: SearchResult[] = [];
      for (const surah of arabicCorpus.current) {
        const engSurah = translationVerses?.find(item => item.number === surah.number);
        for (const verse of surah.ayahs) {
          const ref = refOf(surah.number, verse.numberInSurah);
          const english = gerransMap?.[ref] ?? engSurah?.ayahs.find(item => item.numberInSurah === verse.numberInSurah)?.text ?? "";
          const searchable = globalLanguage === "arabic" ? normalizeArabic(verse.text) : english.toLocaleLowerCase();
          if (searchable.includes(normalizedQuery)) {
            hits.push({ chapter: surah.number, verse: verse.numberInSurah, arabic: verse.text, english });
          }
        }
      }
      setGlobalResults(hits);
      setGlobalTotal(hits.length);
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : "Unable to complete corpus search.");
    } finally { setGlobalLoading(false); }
  }

  function openSearchResult(result: SearchResult) {
    setJumpError("");
    setSearch("");
    scrollTarget.current = refOf(result.chapter, result.verse);
    if (chapter === result.chapter && ayahs.some(a => a.numberInSurah === result.verse)) {
      setSelected([result.verse]);
      requestAnimationFrame(() => {
        document.getElementById(`ccc-verse-${result.chapter}-${result.verse}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    } else {
      pendingJump.current = { chapter: result.chapter, verse: result.verse };
      setChapter(result.chapter);
    }
  }

  const selectedAyahs = ayahs.filter(a => selected.includes(a.numberInSurah));
  const currentSurah = surahs.find(s => s.number === chapter);
  function toggleAyah(n: number) { setSelected(old => old.includes(n) ? old.filter(v => v !== n) : [...old, n].sort((a,b) => a-b)); }
  async function analyze() {
    if (!selectedAyahs.length) { setStatus("Select at least one verse first."); return; }
    setLoading(true); setStatus(""); setAiResponse("");
    try {
      const response = await fetch("/api/ccc-ai", {
        method: "POST", headers: { "Content-Type": "application/json", "x-ccc-passcode": password },
        body: JSON.stringify({ question, chapter, verses: selectedAyahs.map(a => ({ verse: a.numberInSurah, arabic: a.text })) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Research service unavailable");
      setAiResponse(json.answer || "No response returned.");
    } catch (e) { setStatus(e instanceof Error ? e.message : "Unexpected problem"); }
    finally { setLoading(false); }
  }
  function saveNote() {
    if (!selectedAyahs.length) { setStatus("Select a verse before saving a note."); return; }
    const entry: Note = {
      id: `${Date.now()}`, reference: selectedAyahs.map(a => refOf(chapter, a.numberInSurah)).join(", "),
      question, response: aiResponse || "No AI analysis saved; question only.", created: new Date().toISOString(),
    };
    const next = [entry, ...notes]; setNotes(next); localStorage.setItem("ccc-quran-notes-v1", JSON.stringify(next));
    setStatus("Saved in this browser. Export notes before clearing browser data.");
  }
  function exportNotes() {
    const file = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(file); const a = document.createElement("a");
    a.href = href; a.download = "ccc-quran-research-notes.json"; a.click(); URL.revokeObjectURL(href);
  }
  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <div><a href="/" className={styles.back}>← CCC Framework</a><h1>Qurʾān Research Engine</h1><p>Arabic text · verse selection · CCC analysis · research notes</p></div>
        <span className={styles.beta}>Research prototype</span>
      </div>
      <form className={styles.jumpBar} onSubmit={jumpToVerse}>
        <label htmlFor="ccc-verse-jump">Go to verse</label>
        <input id="ccc-verse-jump" value={verseReference} onChange={e => setVerseReference(e.target.value)} placeholder="e.g. 19:28" inputMode="text" aria-describedby="ccc-jump-help" />
        <button type="submit">Go to verse</button>
        <span id="ccc-jump-help" className={styles.jumpHelp}>{jumpError || "Enter surah:verse to open and select it for CCC analysis."}</span>
      </form>
      <section className={styles.globalSearch} aria-label="Search the entire Quran">
        <h2>Search the entire Qurʾān</h2>
        <p className={styles.hint}>Search all 114 surahs by Arabic text or by your selected English translation. This is a keyword search, not a root search.</p>
        <form onSubmit={searchWholeQuran} className={styles.globalSearchForm}>
          <input aria-label="Quran-wide search keyword" value={globalQuery} onChange={e => setGlobalQuery(e.target.value)} placeholder={globalLanguage === "arabic" ? "Arabic word or phrase (e.g. مريم)" : "English word or phrase (e.g. mercy)"} />
          <select aria-label="Search language" value={globalLanguage} onChange={e => setGlobalLanguage(e.target.value as "arabic" | "english")}>
            <option value="arabic">Arabic</option><option value="english">English (selected translation)</option>
          </select>
          <button type="submit" disabled={globalLoading}>{globalLoading ? "Searching…" : "Search all surahs"}</button>
        </form>
        {globalError && <p role="alert" className={styles.searchError}>{globalError}</p>}
        {globalTotal !== null && <p role="status" className={styles.searchCount}>{globalTotal} matching verses{globalLanguage === "english" ? ` · ${editions.find(e => e.id === edition)?.name || edition}` : ""}</p>}
        {globalTotal === 0 && <p className={styles.hint}>No exact keyword matches. Try a shorter word or another spelling.</p>}
        {globalResults.length > 0 && <div className={styles.searchResults}>
          {globalResults.slice(0, globalShown).map(result => <button type="button" className={styles.searchHit} key={`${result.chapter}:${result.verse}`} onClick={() => openSearchResult(result)}>
            <strong>{refOf(result.chapter, result.verse)}</strong>
            {globalLanguage === "arabic" ? <span dir="rtl" lang="ar" className={styles.hitArabic}>{result.arabic}</span> : <span className={styles.hitEnglish}>{result.english}</span>}
          </button>)}
          {globalTotal !== null && globalShown < globalTotal && <button className={styles.moreResults} type="button" onClick={() => setGlobalShown(n => n + MAX_SEARCH_RESULTS)}>Show 100 more ({globalTotal - globalShown} remaining)</button>}
        </div>}
      </section>
      <div className={styles.layout}>
        <section className={styles.panel} aria-label="Quran reader">
          <div className={styles.panelHeader}><h2>Qurʾān reader</h2><span>{ayahs.length} verses</span></div>
          <div className={styles.controls}>
            <label>Surah
              <select value={chapter} onChange={e => setChapter(Number(e.target.value))}>
                {surahs.length ? surahs.map(s => <option value={s.number} key={s.number}>{s.number}. {s.englishName}</option>) : <option value={19}>19. Maryam</option>}
              </select>
            </label>
            <label>Find within surah
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Arabic text or verse number" />
            </label>
          </div>
          <div className={styles.translationControl}>
            <label htmlFor="ccc-translation">English translation</label>
            <select id="ccc-translation" value={edition} onChange={e => setEdition(e.target.value as TranslationEdition)}>
              {editions.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            {translationError && <p className={styles.translationNotice}>{translationError}</p>}
          </div>
          <p className={styles.hint}>Select one or more verses to send their exact Arabic text to the CCC panel. {currentSurah?.englishName || ""}</p>
          <div className={styles.verses}>
            {visible.map(a => <button type="button" id={`ccc-verse-${chapter}-${a.numberInSurah}`} key={a.numberInSurah} onClick={() => toggleAyah(a.numberInSurah)}
              className={`${styles.ayah} ${selected.includes(a.numberInSurah) ? styles.chosen : ""}`} aria-pressed={selected.includes(a.numberInSurah)}>
              <span className={styles.ref}>{refOf(chapter, a.numberInSurah)}</span>
              <span className={styles.arabic} dir="rtl" lang="ar">{a.text}</span>
              <span className={styles.english} lang="en">
                {edition === "gerrans"
                  ? (gerrans[refOf(chapter, a.numberInSurah)] || "Gerrans translation not installed for this verse.")
                  : (translations.find(t => t.numberInSurah === a.numberInSurah)?.text || (translationError || "Loading translation…"))}
              </span>
            </button>)}
            {ayahs.length === 0 && <p className={styles.hint}>Loading the Arabic Qurʾān…</p>}
            {ayahs.length > 0 && visible.length === 0 && <p className={styles.hint}>No matches in this surah.</p>}
          </div>
          <p className={styles.credit}>Arabic text supplied by <a href="https://alquran.cloud/api" target="_blank" rel="noreferrer">Al Quran Cloud API</a> (Uthmani edition). Verify the provider's text edition, accuracy, and rights before public production use. This prototype does not modify the returned Arabic text. English renderings are supplied by their respective translators and are not treated as authoritative Arabic text.</p>
        </section>
        <aside className={styles.sidebar}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>CCC research assistant</h2><span>{selectedAyahs.length} selected</span></div>
            <div className={styles.selection}>{selectedAyahs.length ? selectedAyahs.map(a => <span key={a.numberInSurah}>{refOf(chapter, a.numberInSurah)}</span>) : "Choose a verse on the left"}</div>
            <label className={styles.label}>Research question
              <textarea rows={6} value={question} onChange={e => setQuestion(e.target.value)} />
            </label>
            <label className={styles.label}>Private research passcode
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Set by site administrator" />
            </label>
            <button type="button" className={styles.primary} disabled={loading || !selectedAyahs.length} onClick={analyze}>{loading ? "Analyzing…" : "Analyze with CCC"}</button>
            {status && <p role="status" className={styles.status}>{status}</p>}
            {aiResponse && <div className={styles.answer}><h3>Research response</h3><pre>{aiResponse}</pre></div>}
            <button type="button" className={styles.secondary} onClick={saveNote}>Save research note</button>
            <p className={styles.hint}>Research output may be mistaken. Only the selected verses are sent to AI; pan-textual completeness is not yet automated.</p>
          </section>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Research notebook</h2><button type="button" className={styles.small} onClick={exportNotes} disabled={!notes.length}>Export JSON</button></div>
            {!notes.length ? <p className={styles.hint}>No saved notes yet. Notes stay in this browser until exported.</p> : notes.slice(0, 12).map(n => <details key={n.id} className={styles.note}><summary>{n.reference} · {new Date(n.created).toLocaleDateString()}</summary><p>{n.question}</p><pre>{n.response}</pre></details>)}
          </section>
        </aside>
      </div>
    </main>
  );
}
