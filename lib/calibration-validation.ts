/** Topic-neutral verification of reasoning *categories*, not doctrinal answers.
 * These findings are advisory and quote actual analysis text. No automatic
 * rewrite or predetermined conclusion is permitted.
 */
export type CalibrationFinding = {
  quote: string; issue: string; evidenceRef: string;
  evidenceQuote: string; suggestion: string;
};
const categories = {
  temporal: /(?:cannot|can'?t|could not|does not|doesn't)\s+(?:by (?:its )?wording\s+alone\s+)?(?:adjudicate|apply to|address|govern)\s+(?:any\s+)?(?:texts?|corpora|books?|literature|institutions?|reports?)[^.\n]{0,100}(?:postdat(?:e|ing)|later|after (?:the )?(?:qur.?an|revelation)|subsequent)/i,
  chronology: /(?:later|posthumous|subsequent)[^.\n]{0,90}(?:cannot|can'?t|does not|doesn't)[^.\n]{0,65}(?:adjudicate|apply|address|govern)/i,
  evidenceAuthority: /(?:authenticity|historical reliability|existence of (?:the )?reports?)[^.\n]{0,65}(?:proves|establishes|entails|guarantees)[^.\n]{0,60}(?:divine|legislative|binding) authority/i,
};
function sentences(text:string):string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"“])/).map(x=>x.trim()).filter(Boolean);
}
export function validateCalibrationClaims(text:string, issue:string):CalibrationFinding[] {
  const authorityIssue = /(?:authority|binding|canon|hadith|ḥadīth|sunnah|legislation|revelation|obedience)/i.test(issue);
  if (!authorityIssue) return [];
  const findings:CalibrationFinding[] = [];
  for (const sentence of sentences(text)) {
    if (categories.temporal.test(sentence) || categories.chronology.test(sentence)) {
      findings.push({
        quote:sentence.slice(0,240),
        issue:"Possible temporal-scope fallacy: a general normative criterion can apply to institutions emerging later, even if not named.",
        evidenceRef:"reasoning-category:temporal-scope",
        evidenceQuote:"Date of composition alone does not decide whether a general stated criterion applies.",
        suggestion:"Identify the Qur'anic criterion and test the later authority claim against it; do not infer exemption from chronology."
      });
    } else if (categories.evidenceAuthority.test(sentence)) {
      findings.push({
        quote:sentence.slice(0,240),
        issue:"Authority conflation: historical authentication does not independently establish divine legislative authority.",
        evidenceRef:"reasoning-category:authority-distinction",
        evidenceQuote:"Historical authenticity and divine legislative authorization are separate propositions.",
        suggestion:"Require affirmative authorization for the authority proposition, independently of historical provenance."
      });
    }
    if (findings.length >= 2) break;
  }
  return findings;
}
