# Corpus data-quality audit — 2026-11-18

Audited the repository snapshot's full `morphology.json` and `ccc-quran-arabic.json` without changing either original dataset.

- 6,236 verses in both datasets, identical verse reference sets.
- 77,429 morphology word records; 128,219 segment records.
- No missing segment arrays or unmatched verse keys in this snapshot.
- Four whitespace-token-count exceptions: **2:181, 8:6, 13:37, 37:130**. These are alignment-review candidates; a mismatch is **not** sufficient evidence to rewrite a verse or morphology tag.
- Confirmed presentation-path failure: extended Buckwalter notation (`waqaAluw^A@`, `{kotatabahaA`, `tumolaY\``) leaked from raw morphology surfaces and prompt context into reader-facing text.
- Resolution: presentation-only Arabic rendering for model morphology facts, improved inspector suffix romanization, shared converter, structural audit and regression test.
- **Not claimed:** independent verification of all 77,429 morphological classifications or the historical accuracy of each annotation. Existing corpus-correction entries remain intact; three display-encoding records are appended to `data/corpus-corrections.json` and excluded from model-facing grammatical correction prompts.

## Evidence register

| Ref/token | Original annotation | Reviewed assessment | Status | Regression |
|---|---|---|---|---|
| 25:5:1 | `wa` + `qaAlu` + `w^A@` | Raw extended encoding is valid source notation; displaying it as Latin prose is defective | `original_annotation_supported` / display bug | `tests/corpus-readable.test.mjs` |
| 25:5:4 | `{kotataba` + `haA` | Source encoding needs presentation conversion; Form VIII tag unchanged | `original_annotation_supported` / display bug | `tests/corpus-readable.test.mjs` |
| 25:5:6 | `tumolaY\`` | Source encoding needs presentation conversion; passive Form IV tag unchanged | `original_annotation_supported` / display bug | structural audit + 25:5 test |
| 2:181, 8:6, 13:37, 37:130 | Word-count differences | Do not infer one-to-one whitespace token alignment | `requires_adjudication` | `scripts/audit-corpus-display.mjs` |
