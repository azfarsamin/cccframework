/** Deterministic source-check of known cross-lemma conflations.
 * Do not change source Arabic or automatically rewrite model claims.
 * Results are advisory evidence-review findings for the researcher.
 */
export type LexemeFinding = {quote:string;issue:string;evidenceRef:string;evidenceQuote:string;suggestion:string};
export function verifyGhillAghlalSeparation(analysis:string, reference:string): LexemeFinding[] {
  if (reference !== "7:157") return [];
  // A model sometimes names the aghlāl LEMMA and then cites 7:43,
  // which actually uses ghill (rancour). Shared root is not shared lemma.
  const candidates = analysis.split(/(?<=[.!?])\s+|\n+/);
  const mistaken = candidates.find(sentence =>
    /(?:aghl[aā]l|ٱ?لْأَغْلَـ?ٰ?ل|الأغلال)/iu.test(sentence) &&
    /7:43/.test(sentence) &&
    /(?:lemma|occurrences?|appears?|instances?|includes?|same\s+word)/i.test(sentence) &&
    !/(?:different|distinct|not\s+(?:the\s+)?same|root\s+only|rather\s+than)/i.test(sentence)
  );
  const findings: LexemeFinding[] = mistaken ? [{
    quote: mistaken.trim().slice(0,240),
    issue: "7:43 contains ghill (rancour), not the lemma aghlāl (fetters); a common root is not an identical lemma.",
    evidenceRef: "7:43",
    evidenceQuote: "غِلّ",
    suggestion: "Separate the ghill and aghlāl lemmas; compare their root family only when the distinction is explicit."
  }] : [];
  // The corpus form الخبائث is a non-human broken plural.  Do not
  // characterize its agreement class as a masculine sound plural.
  const wrongPlural = candidates.find(sentence =>
    /(?:khab[aā]ʾith|khab[aā]ith|خَبَـ?ٰ?ٓ?ئِثَ|الخبائث)/iu.test(sentence) &&
    /(?:masculine\s+plural|\bMP\s+accusative|\bMP\b[^.]{0,35}accusative)/i.test(sentence)
  );
  if (wrongPlural) findings.push({
    quote: wrongPlural.trim().slice(0,240),
    issue: "al-khabāʾith is a non-human broken plural, not a masculine sound plural.",
    evidenceRef: "7:157",
    evidenceQuote: "ٱلْخَبَـٰٓئِثَ",
    suggestion: "Describe its morphological plural type accurately; do not infer masculine sound plural from accusative case."
  });
  return findings;
}
