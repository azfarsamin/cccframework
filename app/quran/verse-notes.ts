/**
 * Editorial annotations displayed below the corresponding Qurʾānic verse.
 * These are researcher-supplied notes, not part of the Qurʾān or its translation.
 * Add a second note to the same reference by appending another string to its array.
 */
export const VERSE_NOTES: Readonly<Record<string, readonly string[]>> = {
  "30:2": [
    `**Alternative vocalization** Sam Gerrans reads غَلَبَتِ (ghalabat, active: ‘the Romans prevailed’) rather than غُلِبَتِ (ghulibat, passive: ‘the Romans were defeated’). The consonantal rasm is unchanged.`
  ],
  "5:31": [
    `The allegation that Qurʾān 5:31 plagiarized Jewish rabbinic literature fails the chronological test. The commonly cited *Pirkei de-Rabbi Eliezer* is generally dated to the eighth–ninth century CE, **after the Qurʾān**. Its account also differs: Adam learns burial from a raven, whereas in the Qurʾān it is Cain.

The polemic assumes a supposedly earlier Jewish tradition without producing an earlier textual witness. That does not establish plagiarism. In fact, borrowing in the opposite direction cannot be dismissed, given the post-Qurʾānic dating of the cited work and the absence of a securely dated pre-Qurʾānic manuscript containing the alleged source narrative.

**The burden of proof is on the claimant to produce pre-Qurʾānic manuscript evidence of the alleged source.**`
  ],
  "5:32": [
    `The allegation that Qurʾān 5:32 plagiarized Mishnah Sanhedrin 4:5 rests on conflating an asserted composition date with manuscript evidence.

The Mishnah is conventionally dated to approximately 200 CE, but its earliest surviving substantial codices date centuries after the Qurʾān, principally from the tenth–thirteenth centuries. Its textual witnesses exhibit variants, and scholarship documents centuries of textual transmission and correction. **A conventional date of compilation is not evidence that the precise wording of Sanhedrin 4:5 existed in 200 CE.**

The Qurʾān explicitly attributes the principle to an earlier prescription for the Children of Israel. A case can be made that later rabbinic transmission incorporated Qurʾānic wording.

**The burden of proof is on the claimant to produce securely dated pre-Qurʾānic manuscript evidence containing the alleged source text.**`
  ]
};
