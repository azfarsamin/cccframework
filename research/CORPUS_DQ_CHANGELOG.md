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

## 2026-11-19 — CCC Data Quality v2 (presentation and verification only)

**Upstream datasets unchanged.** The original 6,236-verse Arabic and morphology JSON files are not edited. Corpus-wide structural regression: 6,236 identical verse keys, 77,429 words, 128,219 segments.

| Reference / issue | Original evidence | Review / applied correction | Status | Provenance | Regression |
|---|---|---|---|---|---|
| 9:2:1, plural subject ending | Encoded segment `wA@`, displayed as `وا@` | Remove the extended Buckwalter `@` annotation from the **Arabic segment display**, preserving the annotated 2MP pronoun and whole-word *fa-sīḥū* | `original_annotation_supported` / display-only | Local `public/data/morphology.json` 9:2 word 1 | `tests/ccc-dq-v2-regression.cjs` |
| 25:5:1, plural subject ending | Encoded segment `w^A@`, sometimes exposed as `وا@` | Same shared segment-decoding rule; no verb/person data rewritten | `original_annotation_supported` / display-only | Local morphology 25:5 word 1 | `tests/ccc-dq-v2-regression.cjs` |
| 7:157:23, ٱلْخَبَـٰٓئِثَ | `N`, lemma `xabiyvap`, grammatical features `MP|ACC`; some generated analyses call the plural masculine | Add corpus-facing, reviewed **broken plural** formation and accusative case to deterministic evidence. Do not interpret `MP` as a sound plural category | `original_annotation_supported` / lexical-description correction | Local morphology 7:157 word 23; attested plural/singular خَبَائِث / خَبِيثَة | `tests/ccc-dq-v2-regression.cjs` |
| 7:43 versus 7:157 | The word forms غِلّ and أَغْلَال share source lemma `gil~` but have different context-dependent senses | Preserve upstream lemma; maintain advisory contextual disambiguation (rancour versus fetters) | `original_annotation_supported` / semantic distinction | Source Arabic verses 7:43, 7:157, corpus morphology | `tests/ccc-dq-v2-regression.cjs` |
| Gerrans 7:157#1–4 citations | Valid source ID and `#page=439`, but subsequent Markdown linking produced `[439]\\(`, making links invalid | One idempotent serialization path for existing/corrected citations; renderer reuses that path; no model changes | `display_only` | Registered publication PDF and actual generated 7:157 Section 5 | `tests/ccc-dq-v2-regression.cjs` |

**Limitations:** Verification cannot infer all broken-plural formations from corpus grammatical `MP/FP` features, nor prove the semantic identity of root relatives. Reviewed lexical formations are added conservatively as corpus-derived metadata. Grammar and lexical findings are advisory, not silent edits of GLM's conclusions. No foundational/analytical prompt changes.
