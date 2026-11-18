/** Reviewed local annotation issues. Source morphology JSON remains unmodified. */
import * as registry from "../data/corpus-corrections.json";
export type CorrectionRecord = { id:string; arabic:string; category:string; status:string; original:Record<string,string|undefined>; recommended:Record<string,string|undefined>; confidence:string; reason:string; sources:{kind:string;url:string;supports:string}[]; comment_status:string; roman_aliases?:string[] };
const records = registry.entries as CorrectionRecord[];
export function correctionRecords(refs: string[]): CorrectionRecord[] {
  const refsSet = new Set(refs);
  return records.filter(e => refsSet.has(e.id.split(":").slice(0,2).join(":")));
}
export function correctionPrompt(refs: string[]): string {
  // Presentation-only encoding records are tracked for audit, not supplied
  // as rival grammatical interpretations or downstream doctrine.
  const records = correctionRecords(refs).filter(e => e.category !== "presentation_encoding");
  if (!records.length) return "No adjudicated local correction records apply to the supplied verses.";
  return "AUTHORITATIVE REVIEWED LOCAL CORPUS ANNOTATION REVIEW (do not infer any doctrinal conclusion from these records):\n" +
    records.map(e => `${e.id} ${e.arabic}: status=${e.status}; raw corpus=${JSON.stringify(e.original)}; reviewed=${JSON.stringify(e.recommended)}; confidence=${e.confidence}; rationale=${e.reason}; sources=${e.sources.map(s => s.url).join(", ")}. ${e.status === "requires_adjudication" ? "NOT VERIFIED: preserve ambiguity and do not override corpus." : "Use this reviewed correction rather than the raw corpus tag for the specific token. Do not claim this correction was merged upstream."}`).join("\n");
}
export function correctedGrammarSheet(ref:string, sheet:string):string {
  const records=correctionRecords([ref]).filter(e=>e.status === "correction_supported" && e.category === "morphology_mood");
  return records.reduce((current,e)=>{
    const word = Number(e.id.split(":")[2]);
    return current.split("\n").map(line=>line.startsWith(`${ref} word ${word}: `) ?
      line.replace(/MOOD=[^;\n]+/, `MOOD=${e.recommended.mood} (reviewed local correction; source corpus differs)`) : line).join("\n");
  },sheet);
}

/** Stable machine-readable coverage for code review and regression audits. */
export function corpusCorrectionVersion():string {return String((registry as {schema_version?:number}).schema_version ?? 1)}


/** Exact-token, reviewed presentation overrides. Never mutate upstream morphology.json.
 * A register entry is not automatically a display override: only explicit, audited
 * supported annotations with an implemented mapping may change the inspector. */
export function reviewedDisplaySegments(id: string, original: [string, string, string][]): [string, string, string][] {
  const record = records.find(e => e.id === id && e.status === "correction_supported");
  if (!record || id !== "12:33:7") return original;
  if (record.recommended.person_number !== "3FP") return original;
  return original.map(([surface, pos, features]) => {
    if (pos === "V") return [surface, pos, features.replace(/\|3MP(?=\||$)/g, "|3FP")];
    if (pos === "PRON" && /PRON:3MP/.test(features))
      return [surface, pos, features.replace(/PRON:3MP/g, "PRON:3FP")];
    return [surface, pos, features];
  });
}

export function displayCorrectionNotice(id: string): string {
  if (id === "12:33:7" && records.some(e => e.id === id && e.status === "correction_supported"))
    return "Feminine plural subject (3FP), consistent with the women referred to in 12:33. The source corpus retains the masculine plural tag (3MP); only this reviewed display has been corrected.";
  return "";
}
