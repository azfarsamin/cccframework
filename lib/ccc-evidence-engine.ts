/** Exhaustive, corpus-verified evidence; no generative model selects membership. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buckwalterToArabic, normalizeRoot, type Morphology } from "./ccc-corpus-search";
import { type QueryPlan } from "./ccc-query-planner";
import { NARRATIVE_WINDOWS } from "./ccc-narrative-index";

type Word = Morphology[string][number];
let corpusPromise: Promise<Morphology> | undefined;
function morphology(): Promise<Morphology> {
  corpusPromise ??= readFile(path.join(process.cwd(), "public/data/morphology.json"), "utf8")
    .then(t => JSON.parse(t) as Morphology)
    .then(d => { if (Object.keys(d).length !== 6236) throw Error("Incomplete morphology index"); return d; })
    .catch(e => { corpusPromise = undefined; throw e; });
  return corpusPromise;
}
const REF_ORDER = (a: string, b: string) => {
  const [ac,av] = a.split(":").map(Number), [bc,bv] = b.split(":").map(Number);
  return ac-bc || av-bv;
};
export type Evidence = {
  kind: "verse" | "phrase" | "lemma" | "root";
  label: string;
  references: string[];
  perVerseCount: Record<string,number>;
  occurrences: number;
  complete: true;
  scope: string;
  narrativeReferences: string[];
};
function normLemma(x: string) { return x.replace(/[@_#]/g, ""); }
function matchesLemma(word: Word, lemma: string) {
  // Morphology dataset stores Buckwalter; do NOT conflate words sharing a root.
  return word.l === lemma || (lemma === "Hikomap" && word.l === "Hikomap") || normLemma(word.l || "") === normLemma(lemma);
}
function hasSequence(words: Word[], lemmas: string[]) {
  let hits = 0;
  for (let i = 0; i <= words.length - lemmas.length; i++) {
    if (lemmas.every((l, j) => matchesLemma(words[i+j], l))) hits++;
  }
  return hits;
}
export async function collectEvidence(plan: Exclude<QueryPlan, {kind:"semantic"}>): Promise<Evidence> {
  const data = await morphology();
  if (plan.kind === "verse") {
    const refs = plan.refs.map(r => `${r.chapter}:${r.verse}`);
    const missing = refs.filter(ref => !(ref in data));
    if (missing.length) throw new Error(`Nonexistent Qur'anic verse(s): ${missing.join(", ")}`);
    const context = new Set<string>();
    if (plan.analysis && refs.length <= 8) {
      const radius = refs.length === 1 ? 4 : 1;
      for (const ref of refs) {
        const [s,v] = ref.split(":").map(Number);
        for(let n=v-radius;n<=v+radius;n++) if(n>0 && `${s}:${n}` in data && !refs.includes(`${s}:${n}`))context.add(`${s}:${n}`);
      }
    }
    return { kind: "verse", label: "Requested Qurʾānic verses", references: refs,
      perVerseCount: Object.fromEntries(refs.map(ref=>[ref,1])), occurrences: refs.length, complete: true, scope: "exact references",
      narrativeReferences: [...context].sort(REF_ORDER) };
  }
  const refs: string[] = [];
  const perVerseCount: Record<string,number> = {};
  let count = 0;
  for (const [ref, words] of Object.entries(data)) {
    let hits = 0;
    if (plan.kind === "phrase") hits = hasSequence(words, plan.lemmas);
    if (plan.kind === "lemma") hits = words.filter(w => matchesLemma(w, plan.lemma)).length;
    if (plan.kind === "root") hits = words.filter(w => w.r && normalizeRoot(buckwalterToArabic(w.r)) === normalizeRoot(plan.root)).length;
    if (hits) { count += hits; refs.push(ref); perVerseCount[ref]=hits; }
  }
  refs.sort(REF_ORDER);
  const expansions = new Set<string>();
  // Narrative expansion is separate from direct phrase counts. These are
  // immediate passages only; complete literary boundaries need a further
  // human-reviewed or model-audited narrative index.
  if (plan.kind === "phrase" && plan.expand) {
    const windows = NARRATIVE_WINDOWS[plan.label] || [];
    // Curated boundaries (if available) have priority over generic proximity.
    if (windows.length) for (const [chapter,start,end] of windows) {
      for(let v=start;v<=end;v++) {
        const ref=`${chapter}:${v}`;
        if(ref in data && !refs.includes(ref)) expansions.add(ref);
      }
    } else {
      // Generic proximity is context, not a claim of full narrative coverage.
      for (const ref of refs.slice(0,12)) {
        const [s,v] = ref.split(":").map(Number);
        for (let n = v-1; n <= v+3; n++) if (n>0 && `${s}:${n}` in data && !refs.includes(`${s}:${n}`)) expansions.add(`${s}:${n}`);
      }
    }
  }
  return { kind: plan.kind, label: plan.label, references: refs, perVerseCount, occurrences: count,
    complete: true, scope: plan.scope, narrativeReferences: [...expansions].sort(REF_ORDER) };
}

// Local, independently complete Arabic verse text. Eliminates external API
// outages from deterministic Quran lookups. Verse zero basmalahs are excluded.
let arabicPromise: Promise<Map<string,string>> | undefined;
async function quranArabic(): Promise<Map<string,string>> {
  arabicPromise ??= readFile(path.join(process.cwd(), "public/data/ccc-quran-arabic.json"), "utf8")
    .then(raw => JSON.parse(raw) as Record<string,string>)
    .then(values => {
      if (Object.keys(values).length !== 6236 || !values["1:1"] || !values["114:6"])
        throw new Error("Incomplete local Arabic Quran text");
      return new Map(Object.entries(values));
    }).catch(e => { arabicPromise = undefined; throw e; });
  return arabicPromise;
}
export async function versesForReferences(references: string[]): Promise<{rows:{reference:string;arabic:string}[]; textAvailable:boolean}> {
  try {
    const full = await quranArabic();
    return { rows: references.map(reference => ({reference, arabic:full.get(reference) || ""})), textAvailable:true };
  } catch (error) {
    console.warn("CCC Arabic source unavailable; returning fully verified references without invented text", { error: error instanceof Error ? error.message : "unknown" });
    return {rows: references.map(reference=>({reference,arabic:""})),textAvailable:false};
  }
}
export function formatExactEvidence(e: Evidence, verses: {rows:{reference:string;arabic:string}[];textAvailable:boolean}, fullText: boolean):string {
  const header = `**${e.label}** — ${e.occurrences} ${e.kind === "verse" ? "requested verses" : "exact word/phrase occurrences"} in ${e.references.length} verses.\n**Scope:** Complete ${e.scope} match in the local Qurʾānic index.`;
  const counted = e.references.map(ref=>e.perVerseCount[ref]>1 ? `${ref} (${e.perVerseCount[ref]} occurrences)` : ref);
  if (!fullText) return `${header}\n\n${counted.join(", ")}`;
  if (!verses.textAvailable) return `${header}\n\n${e.references.join(", ")}\n\nFull Arabic text was temporarily unavailable; no verse text has been fabricated.`;
  return `${header}\n\n${verses.rows.map(v => `**${v.reference}${e.perVerseCount[v.reference]>1 ? ` (${e.perVerseCount[v.reference]} occurrences)` : ""}** — ${v.arabic}`).join("\n\n")}`;
}
