"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  buildCorpusIndex, corpusForms, exportCorpusCsv, FORM_ORDER,
  normalizeRoot, queryCorpus, resultCounts,
  type CorpusToken, type Morphology, type SearchMode, type SearchQuery
} from "../../../lib/ccc-corpus-search";
import styles from "./corpus.module.css";

const ANY = "any";
const PAGE_SIZE = 75;
const ar = new Intl.Collator("ar");
const count = (value: number) => value.toLocaleString("en");
type Grouping = "verse" | "root" | "form";

function describeQuery(q: SearchQuery): string {
  const subject = q.mode === "root" && q.form === ANY
    ? "all annotated derivatives" : q.form === ANY ? "all verbs" : `Form ${q.form} verbs`;
  const scope = q.root !== ANY ? `root ${q.root}` : q.letter !== ANY ? `roots beginning with ${q.letter}` : "all roots";
  return `${subject} · ${scope}`;
}

export default function QuranCorpusSearchPage() {
  const [tokens, setTokens] = useState<CorpusToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<SearchMode>("root");
  const [letter, setLetter] = useState(ANY);
  const [root, setRoot] = useState(ANY);
  const [form, setForm] = useState(ANY);
  const [applied, setApplied] = useState<SearchQuery | null>(null);
  const [grouping, setGrouping] = useState<Grouping>("verse");
  const [shown, setShown] = useState(PAGE_SIZE);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/data/morphology.json", { signal: controller.signal });
        if (!response.ok) throw new Error(`Morphology file missing (HTTP ${response.status}). Existing file needed: public/data/morphology.json.`);
        const data = await response.json() as Morphology;
        const indexed = buildCorpusIndex(data);
        if (!controller.signal.aborted) setTokens(indexed);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load morphology annotations.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  // Reader Roots -> Corpus Search passes the exact current root in the URL.
  // Also supports shareable example queries such as ?mode=verb&form=VIII.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!["mode", "root", "letter", "form"].some(name => params.has(name))) return;
    const q: SearchQuery = {
      mode: params.get("mode") === "verb" ? "verb" : "root",
      letter: params.get("letter") || ANY,
      root: params.get("root") ? normalizeRoot(params.get("root") || "") : ANY,
      form: params.get("form") || ANY,
    };
    if (!q.root) q.root = ANY;
    if (q.letter !== ANY) q.letter = normalizeRoot(q.letter).charAt(0) || ANY;
    if (q.form !== ANY && !FORM_ORDER.includes(q.form)) q.form = ANY;
    setMode(q.mode); setLetter(q.letter); setRoot(q.root); setForm(q.form);
    setApplied(q); setShown(PAGE_SIZE);
  }, []);

  const rootStats = useMemo(() => {
    const all = new Map<string, { all: number; verbForms: Map<string, number>; verbs: number }>();
    for (const t of tokens) {
      if (!t.root) continue;
      let item = all.get(t.root);
      if (!item) { item = { all: 0, verbForms: new Map(), verbs: 0 }; all.set(t.root, item); }
      item.all++;
      if (t.form) {
        item.verbs++;
        item.verbForms.set(t.form, (item.verbForms.get(t.form) || 0) + 1);
      }
    }
    return all;
  }, [tokens]);

  // The mode changes which tier is the parent; the stored morphology remains unchanged.
  const eligibleRootStats = useMemo(() => {
    return Array.from(rootStats, ([value, info]) => {
      const occurrences = mode === "root" ? info.all : form === ANY ? info.verbs : info.verbForms.get(form) || 0;
      return { root: value, occurrences };
    }).filter(x => x.occurrences > 0);
  }, [rootStats, mode, form]);

  const initialLetters = useMemo(() => Array.from(new Set(eligibleRootStats.map(x => x.root[0]))).sort(ar.compare), [eligibleRootStats]);
  const eligibleRoots = useMemo(() => eligibleRootStats.filter(x => letter === ANY || x.root.startsWith(letter)).sort((a, b) => ar.compare(a.root, b.root)), [eligibleRootStats, letter]);
  const availableForms = useMemo(() => {
    if (mode === "verb") return FORM_ORDER.filter(f => tokens.some(t => t.form === f));
    return corpusForms(tokens, root, letter);
  }, [tokens, mode, root, letter]);

  const result = useMemo(() => applied ? queryCorpus(tokens, applied) : [], [tokens, applied]);
  const summary = useMemo(() => resultCounts(result), [result]);
  const displayed = useMemo(() => {
    if (grouping === "verse") return result.slice(0, shown);
    // Grouping changes only the display order, never the verified counts.
    const ordered = [...result].sort((a, b) => {
      const formRank = (value: string) => value ? FORM_ORDER.indexOf(value) : 999;
      const first = grouping === "root" ? ar.compare(a.root, b.root) :
        formRank(a.form) - formRank(b.form);
      return first || a.chapter - b.chapter || a.verse - b.verse || a.position - b.position;
    });
    return ordered.slice(0, shown);
  }, [result, shown, grouping]);
  const totalWords = tokens.length;
  const totalVerbs = useMemo(() => tokens.filter(t => Boolean(t.form)).length, [tokens]);
  const ready = !loading && !error;

  function changeMode(value: SearchMode) {
    setMode(value); setLetter(ANY); setRoot(ANY); setForm(ANY); setApplied(null); setShown(PAGE_SIZE);
  }
  function changeLetter(value: string) {
    setLetter(value); setRoot(ANY); setShown(PAGE_SIZE);
    if (mode === "root") setForm(ANY);
  }
  function changeRoot(value: string) {
    setRoot(value); setShown(PAGE_SIZE);
    if (mode === "root") setForm(ANY);
  }
  function changeForm(value: string) {
    setForm(value); setShown(PAGE_SIZE);
    if (mode === "verb") { setLetter(ANY); setRoot(ANY); }
  }
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = { mode, letter, root, form };
    setApplied(q); setShown(PAGE_SIZE);
    const params = new URLSearchParams();
    params.set("mode", mode); params.set("letter", letter); params.set("root", root); params.set("form", form);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }
  function exportCsv() {
    if (!applied || !result.length) return;
    const csv = `\uFEFF${exportCorpusCsv(result)}`; // Excel-friendly Arabic UTF-8
    const href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = href; anchor.download = `ccc-corpus-${applied.mode}-${applied.form}-${applied.root}.csv`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    URL.revokeObjectURL(href);
  }
  function readerHref(t: CorpusToken) {
    const params = new URLSearchParams({ verse: t.reference, word: String(t.position) });
    return `/quran?${params.toString()}`;
  }

  return <main className={styles.main}>
    <header className={styles.header}>
      <div>
        <a className={styles.back} href="/">← CCC Framework</a>
        <h1>Qurʾān Research Engine</h1>
        <p>Deterministic, Qurʾān-only linguistic investigation</p>
      </div>
      <span className={styles.tag}>Corpus research</span>
    </header>
    <nav className={styles.nav} aria-label="Qurʾān research navigation">
      <a href="/quran">Qurʾān Reader</a>
      <a href="/quran/corpus" aria-current="page" className={styles.active}>Corpus Search</a>
    </nav>

    <section className={styles.intro}>
      <div>
        <h2>Corpus Search</h2>
        <p>Search Qurʾānic morphology using two complementary three-tier hierarchies. Every count comes from the installed Arabic corpus annotations.</p>
      </div>
      <div className={styles.dataset}>
        {loading ? "Loading the morphology dataset…" : error ? "Dataset unavailable" : <>
          <strong>{count(totalWords)}</strong> annotated word positions<br/>
          <strong>{count(totalVerbs)}</strong> verb positions · 6,236 verses
        </>}
      </div>
    </section>
    {error && <p className={styles.error} role="alert">{error}</p>}

    <form onSubmit={submit} className={styles.filterPanel}>
      <fieldset className={styles.modeFieldset} disabled={!ready}>
        <legend>Search hierarchy</legend>
        <div className={styles.modeButtons}>
          <button type="button" aria-pressed={mode === "root"} className={mode === "root" ? styles.modeActive : ""} onClick={() => changeMode("root")}>Root-led</button>
          <button type="button" aria-pressed={mode === "verb"} className={mode === "verb" ? styles.modeActive : ""} onClick={() => changeMode("verb")}>Verb-form-led</button>
        </div>
      </fieldset>
      <div className={styles.threeTiers}>
        {mode === "root" ? <>
          <label>Tier 1 — Root's first letter
            <select value={letter} disabled={!ready} onChange={e => changeLetter(e.target.value)}>
              <option value={ANY}>Any letter</option>
              {initialLetters.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Tier 2 — Root
            <select value={root} disabled={!ready} onChange={e => changeRoot(e.target.value)}>
              <option value={ANY}>Any root ({count(eligibleRoots.length)} available)</option>
              {eligibleRoots.map(v => <option key={v.root} value={v.root}>{v.root} — {count(v.occurrences)} occurrences</option>)}
            </select>
          </label>
          <label>Tier 3 — Grammatical form
            <select value={form} disabled={!ready} onChange={e => changeForm(e.target.value)}>
              <option value={ANY}>Any — all root derivatives</option>
              {availableForms.map(f => <option key={f} value={f}>Verb Form {f}</option>)}
            </select>
          </label>
        </> : <>
          <label>Tier 1 — Verb form
            <select value={form} disabled={!ready} onChange={e => changeForm(e.target.value)}>
              <option value={ANY}>Any — all verb forms</option>
              {availableForms.map(f => <option key={f} value={f}>Verb Form {f}</option>)}
            </select>
          </label>
          <label>Tier 2 — Root's first letter
            <select value={letter} disabled={!ready} onChange={e => changeLetter(e.target.value)}>
              <option value={ANY}>Any letter</option>
              {initialLetters.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>
          <label>Tier 3 — Root
            <select value={root} disabled={!ready} onChange={e => changeRoot(e.target.value)}>
              <option value={ANY}>Any root ({count(eligibleRoots.length)} available)</option>
              {eligibleRoots.map(v => <option key={v.root} value={v.root}>{v.root} — {count(v.occurrences)} verbs</option>)}
            </select>
          </label>
        </>}
      </div>
      <p className={styles.explanation}>{mode === "root"
        ? "Any grammatical form includes verbs, nouns, participles and other annotated derivatives. Selecting a numbered form restricts results to verbs."
        : "Any verb form retrieves all annotated verbs, not nouns. Choose a first letter and root to narrow the same corpus-wide search."}</p>
      <div className={styles.filterActions}>
        <button type="submit" disabled={!ready} className={styles.primary}>Search corpus</button>
        <button type="button" disabled={!ready} className={styles.secondary} onClick={() => { setLetter(ANY); setRoot(ANY); setForm(ANY); setApplied(null); setShown(PAGE_SIZE); window.history.replaceState(null, "", "/quran/corpus"); }}>Reset filters</button>
      </div>
    </form>

    <section className={styles.results} aria-label="Corpus search results">
      <div className={styles.resultsHeader}>
        <div><h2>Search Results</h2><p>{applied ? describeQuery(applied) : "Select filters, then search the complete corpus."}</p></div>
        <button type="button" className={styles.secondary} onClick={exportCsv} disabled={!applied || result.length === 0}>Export CSV</button>
      </div>
      {applied && ready ? <>
        <div className={styles.stats} aria-label="Verified result counts">
          <div><strong>{count(summary.occurrences)}</strong><span>word occurrences</span></div>
          <div><strong>{count(summary.verses)}</strong><span>unique verses</span></div>
          <div><strong>{count(summary.roots)}</strong><span>distinct roots</span></div>
        </div>
        <div className={styles.toolbar}>
          <span>Showing {count(Math.min(shown, result.length))} of {count(result.length)} occurrences</span>
          <label>Display order
            <select value={grouping} onChange={e => { setGrouping(e.target.value as Grouping); setShown(PAGE_SIZE); }}>
              <option value="verse">Qurʾān order</option><option value="root">By root</option><option value="form">By grammatical form</option>
            </select>
          </label>
        </div>
        {result.length ? <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Verse / word</th><th scope="col">Arabic word</th><th scope="col">Root · lemma</th><th scope="col">Grammar</th><th scope="col">Open</th></tr></thead>
            <tbody>{displayed.map(t => <tr key={`${t.reference}:${t.position}`}>
              <td><strong>{t.reference}:{t.position}</strong></td>
              <td className={styles.arabic} dir="rtl" lang="ar">{t.word}</td>
              <td><span className={styles.arabicRoot} dir="rtl" lang="ar">{t.root || "—"}</span><small dir="rtl" lang="ar">{t.lemma}</small></td>
              <td><strong>{t.form ? `Verb · Form ${t.form}` : t.pos}</strong><small>{[t.aspect, t.voice].filter(Boolean).join(" · ")}</small></td>
              <td><a className={styles.openLink} href={readerHref(t)} target="_blank" rel="noopener noreferrer" title="Open this verse and word in a new Reader tab">Open in Reader ↗</a><a className={styles.sourceLink} href={`https://corpus.quran.com/wordmorphology.jsp?location=(${t.reference}:${t.position})`} target="_blank" rel="noreferrer">Word morphology ↗</a></td>
            </tr>)}</tbody>
          </table>
        </div> : <p className={styles.empty}>No matching annotations for this combination. Try “Any” in one or more tiers.</p>}
        {shown < result.length && <button type="button" className={styles.more} onClick={() => setShown(x => x + PAGE_SIZE)}>Show next {count(Math.min(PAGE_SIZE, result.length - shown))} occurrences ({count(result.length - shown)} remaining)</button>}
      </> : <p className={styles.empty}>{loading ? "Loading corpus annotations…" : error ? "Search is unavailable until the morphology dataset loads." : "Root-led searches include all annotated derivatives. Verb-form-led searches include verbs only."}</p>}
    </section>
    <footer className={styles.footer}>
      Morphology: <a href="https://corpus.quran.com" target="_blank" rel="noreferrer">Qurʾānic Arabic Corpus v0.4</a>, © Kais Dukes (2011). The tool searches its existing local annotations without AI, hadith or tafsīr. Grammatical labels are annotations, not the Qurʾānic text. Word surfaces shown here are converted from Buckwalter; open the Reader for the original Uthmānī verse text. "Form I" is the corpus's unmarked basic verbal form.
    </footer>
  </main>;
}
