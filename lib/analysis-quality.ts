/** Deterministic reader-facing checks. Advisory only; no silent model rewriting. */
export type QualityFinding = {quote:string;issue:string;evidenceRef:string;evidenceQuote:string;suggestion:string};
export function reviewAnalysisQuality(text:string, ref:string, supplied:Set<string>):QualityFinding[]{
  const issues:QualityFinding[]=[];
  function add(pattern:RegExp,issue:string,suggestion:string,evidenceRef=ref,evidenceQuote="Reader-facing analysis policy"){
    const m=pattern.exec(text);if(!m)return;
    issues.push({quote:m[0].slice(0,240),issue,evidenceRef,evidenceQuote,suggestion});
  }
  add(/\b(?:malak manifest|lemma manifest|root manifest|retrieval window|research chunk|backend variable|coverage telemetry)\b/i,
    "Internal retrieval terminology is exposed to readers.",
    "Replace implementation details with an accurate natural-language statement of verses examined or missing.");
  add(/\b(?:jaAEil|xaliyfap|yasofiku|jEl|>afosadu|sab~aHa|Hamod|>aroD|qaAla|rab~)\b/,
    "Raw Buckwalter corpus identifier in publishable prose.",
    "Use verified Arabic script or scholarly transliteration; retain machine identifiers only in private diagnostics.");
  add(/(?:خَلِيفَةً|khalīfa).{0,100}(?:governed by|governed under).{0,85}(?:فِى|فِي|earth|preposition)/i,
    "Accusative object incorrectly described as governed by the locative preposition.",
    "The active participle governs its object; fī al-arḍ supplies location, not accusative case.","2:30", "جَاعِلٌ فِي الْأَرْضِ خَلِيفَةً");
  add(/(?:ء.pattern noun|morphology tag conflict|tag conflict).{0,100}(?:خَلِيفَة|khalīfa|feminine)/i,
    "Unfounded morphological conflict or invented pattern label.",
    "Distinguish morphological form from referent's sex; inspect 38:26, which addresses David as khalīfa.","38:26", "خَلِيفَةً");
  add(/(?:every|all|each).{0,90}(?:جَاعِل|jāʿil).{0,120}(?:appointment|office|role)/i,
    "Overgeneralization about the participle's semantic roles.",
    "Test 18:8 and distinguish making something a state from appointing a role.","18:8", "لَجَاعِلُونَ");
  if(ref==="28:10") {
    add(/(?:إِنْ?\s+كَادَتْ|in\s+k[aā]dat).{0,130}(?:conditional|genuine conditional|apodosis)/i,
      "Incorrect conditional parse: 28:10 إِنْ is lightened emphatic inna, not a conditional protasis.",
      "Parse إِنْ as lightened emphatic inna; لَتُبْدِي bears distinguishing lām, while لَوْلَا supplies the counterfactual condition.","28:10", "إِنْ كَادَتْ لَتُبْدِي بِهِ لَوْلَا أَنْ رَبَطْنَا");
    add(/(?:قَلْب|qalb).{0,80}(?:feminine noun|noun is feminine|feminine singular noun|tagged FS)/i,
      "Incorrect singular qalb gender; corpus FS noun tag should be overridden locally.",
      "Singular qalb is masculine; the possessive suffix -hā is 3FS and refers to Moses' mother.","28:10:14", "قَلْبِهَا");
    add(/(?:لِتَكُونَ|litak[uū]na).{0,110}(?:k[aā]da|root k.w.d|imperfect kāda|imperfect of k[aā]da)/i,
      "Incorrect root for litakūna: the source corpus already correctly gives k-w-n.",
      "litakūna is from kāna (ك و ن), third feminine singular subjunctive, not kāda.","28:10:15", "لِتَكُونَ");
    add(/(?:thab[aā]t|stabili[sz](?:e|ation)|similar meaning).{0,160}(?:interchangeab|synonym|same grammatical|same predicate)/i,
      "A shared semantic field does not establish lexical or grammatical interchangeability.",
      "Compare thabbata fuʾād (11:120; 25:32) with rabaṭa ʿalā qalb (8:11; 18:14; 28:10) as different predicates; evaluate overlap and contrast separately.","28:10", "نُثَبِّتُ فُؤَادَكَ / رَبَطْنَا عَلَىٰ قَلْبِهَا");
  }
  if(ref==="2:30") {
    const key=["7:11","38:71","38:72","38:73"].filter(r=>!supplied.has(r));
    if(key.length)issues.push({quote:"2:30 essential parallels",issue:`Direct narrative comparisons not supplied in full: ${key.join(", ")}.`,evidenceRef:ref,evidenceQuote:"Required comparison inventory",suggestion:"Retrieve complete Arabic for the missing passages before publishing."});
  }
  return issues.slice(0,6);
}
