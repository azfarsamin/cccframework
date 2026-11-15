/** Reviewed local annotation issues. Source morphology JSON remains unmodified. */
import * as registry from "../data/corpus-corrections.json";
export type CorrectionRecord = { id:string; arabic:string; category:string; status:string; original:Record<string,string|undefined>; recommended:Record<string,string|undefined>; confidence:string; reason:string; sources:{kind:string;url:string;supports:string}[]; comment_status:string; roman_aliases?:string[] };
const records = registry.entries as CorrectionRecord[];
export function correctionRecords(refs: string[]): CorrectionRecord[] {
  const refsSet = new Set(refs);
  return records.filter(e => refsSet.has(e.id.split(":").slice(0,2).join(":")));
}
export function correctionPrompt(refs: string[]): string {
  const records = correctionRecords(refs);
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
