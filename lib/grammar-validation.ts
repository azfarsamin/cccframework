import { correctionRecords } from "./corpus-corrections";
/** Topic-neutral, corpus-anchored checking of explicit morphological claims.
 * Detects a conflict only when a clause identifies a single verb unambiguously
 * (or explicitly names the word number). Missing tags are not negative proof.
 * Also catches one logically invalid rule: a relative pronoun by itself does
 * not impose subjunctive or jussive mood on a subordinate finite verb.
 */
export type MorphSegment = [string, string, string];
export type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
export type Morphology = Record<string, MorphWord[]>;
export type Corpus = Record<string, string>;
export type GrammarFinding = {
  quote: string; issue: string; evidenceRef: string; evidenceQuote: string; suggestion: string;
};
const formValues = ["XII","XI","VIII","VII","VI","IV","IX","III","II","V","X","I"];
const moodNames:Record<string,string>={IND:"indicative",SUBJ:"subjunctive",JUS:"jussive",ENG:"energetic"};
const diacritics=/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const normalizeArabic=(s:string)=>s.normalize("NFKD").replace(diacritics, "").replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي");
const letters:Record<string,string>={ا:"a",ب:"b",ت:"t",ث:"th",ج:"j",ح:"h",خ:"kh",د:"d",ذ:"dh",ر:"r",ز:"z",س:"s",ش:"sh",ص:"s",ض:"d",ط:"t",ظ:"z",ع:"",غ:"gh",ف:"f",ق:"q",ك:"k",ل:"l",م:"m",ن:"n",ه:"h",و:"w",ي:"y",ة:"a",ء:"",ؤ:"w",ئ:"y",
"َ":"a","ُ":"u","ِ":"i","ْ":"","ّ":""};
function transliterate(s:string){
  return [...s.normalize("NFC")].map(x=>letters[x]??"").join("").replace(/([aiu])\1+/g,"$1");
}
function latin(s:string){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
  .replace(/[ʾʿ‘’'`ʔ]/g,"").replace(/ḫ/g,"kh").replace(/š/g,"sh").replace(/ḍ/g,"d")
  .replace(/ṣ/g,"s").replace(/ṭ/g,"t").replace(/ẓ/g,"z").replace(/ġ/g,"gh");}
function verbFacts(w:MorphWord){
  const part=w.s.find(([,pos])=>pos==="V"); if(!part)return null;
  const tags=part[2].split("|").filter(Boolean);
  const form=formValues.find(f=>tags.includes(`(${f})`)) || "I";
  const moodTag=tags.find(t=>t.startsWith("MOOD:"))?.slice(5);
  const mood=moodTag?moodNames[moodTag]:undefined;
  const voice=tags.includes("PASS")?"passive":tags.includes("ACT")?"active":undefined;
  const aspect=tags.includes("IMPF")?"imperfect":tags.includes("PERF")?"perfect":tags.includes("IMPV")?"imperative":undefined;
  const personTag=tags.find(t=>/^[123](?:MS|FS|MP|FP|D|M|F|P|S)$/.test(t));
  return {form,mood,voice,aspect,tags,personTag};
}
export function deterministicGrammarSheet(ref:string,morph:Morphology):string{
  return (morph[ref]||[]).flatMap((w,i)=>{
    const f=verbFacts(w);if(!f)return [];
    return [`${ref} word ${i+1}: ${w.s.map(x=>x[0]).join("")} [lemma=${w.l||"?"}; root=${w.r||"?"}] `+
      `FORM=${f.form}; ASPECT=${f.aspect||"not annotated"}; VOICE=${f.voice||"not annotated"}; PERSON=${f.personTag||"NOT ANNOTATED"}; MOOD=${f.mood||"NOT ANNOTATED — do not infer"}`];
  }).join("\n")||"No annotated verbs in the focal verse.";
}
/** Noun/adjective case facts are verified from each token's STEM annotation.
 * An idaafa gives the following mudaf ilayh genitive case, not necessarily
 * the governing case of its head. A corpus case tag does not establish the
 * token's syntactic function (e.g. second object versus haal).
 */
const nominalPositions = new Set(["N", "ADJ", "PN"]);
const caseNames: Record<string,string> = { NOM:"nominative", ACC:"accusative", GEN:"genitive" };
/** Verified *forms*, not a guessed MP->sound-plural conversion. This registry can
 * be extended after lexical review; it applies to every occurrence of each
 * attested form and does not alter the morphology dataset. */
const verifiedBrokenPlurals: Record<string,string> = {
  "الخبائث": "خَبِيثَة",
  "الاغلال": "غُلّ",
  "اساطير": "أُسْطُورَة",
};
function documentedPluralPattern(word: MorphWord): string | undefined {
  // The morphology JSON preserves Uthmani small alif in khabāʾith, so its
  // consonantal skeleton differs from modern full-alif spelling. Match both
  // the reviewed encoded surface and ordinary normalized orthography.
  const form = corpusArabicSurface(word).replace(/^ال/, "");
  const documentedKhabaaith = word.l === "xabiyvap" &&
    word.s.some(([encoded]) => /^xaba[`^]*\}iva/.test(encoded));
  const singular = documentedKhabaaith ? "خَبِيثَة" :
    (verifiedBrokenPlurals[form] || verifiedBrokenPlurals["ال"+form]);
  return singular ? `broken plural (verified lexical formation; singular ${singular})` : undefined;
}

function nominalFacts(w:MorphWord) {
  const part = w.s.find(([,pos])=>nominalPositions.has(pos));
  if(!part)return null;
  const tags=part[2].split("|").filter(Boolean);
  const caseTag=["NOM","ACC","GEN"].find(t=>tags.includes(t));
  return {pos:part[1],caseName:caseTag?caseNames[caseTag]:undefined,tags};
}
export function deterministicNominalSheet(ref:string,morph:Morphology):string{
  return (morph[ref]||[]).flatMap((w,i)=>{
    const f=nominalFacts(w); if(!f)return [];
    return [`${ref} word ${i+1}: ${w.s.map(x=>x[0]).join("")} [lemma=${w.l||"?"}; root=${w.r||"?"}] `+
      `POS=${f.pos}; CASE=${f.caseName||"NOT ANNOTATED — do not infer"}; `+
      `PLURAL_FORMATION=${documentedPluralPattern(w)||"NOT VERIFIED — MP/FP are grammatical features, not sound-plural patterns"}; `+
      `SYNTAX=not annotated (do not infer grammatical role from case or idaafa membership)`];
  }).join("\n")||"No annotated nominal cases in the focal verse.";
}
// Buckwalter surfaces contain corpus-specific vowel markers. Keep only Arabic
// letters, then match exact Arabic word tokens in the analysis; never guess
// cases from transliteration or from other words in the same sentence.
const buckwalterConsonants:Record<string,string>={
  "'":"ء","|":"آ",">":"أ","&":"ؤ","<":"إ","}":"ئ",A:"ا",b:"ب",p:"ة",t:"ت",v:"ث",j:"ج",H:"ح",x:"خ",d:"د","*":"ذ",r:"ر",z:"ز",s:"س","$":"ش",S:"ص",D:"ض",T:"ط",Z:"ظ",E:"ع",g:"غ",f:"ف",q:"ق",k:"ك",l:"ل",m:"م",n:"ن",h:"ه",w:"و",Y:"ى",y:"ي","{":"ٱ"
};
function corpusArabicSurface(w:MorphWord):string {
  return normalizeArabic(w.s.map(([text])=>[...text].map(c=>buckwalterConsonants[c]||"").join("")).join(""));
}
function explicitNominalCases(analysis:string,ref:string,morph:Morphology):GrammarFinding[]{
  const words=morph[ref]||[]; const findings:GrammarFinding[]=[]; const found=new Set<number>();
  const grammarSection=(analysis.split(/##\s*1\.\s*Grammar and morphology/i)[1]||"")
    .split(/##\s*2\./)[0];
  for(const line of units(grammarSection)) {
    const matchCase=/\b(nominative|accusative|genitive)\s+(?:case|noun|adjective|proper noun)\b|\b(?:case\s*(?:is|:)\s*)(nominative|accusative|genitive)\b/gi;
    const caseClaims=[...line.matchAll(matchCase)].map(m=>(m[1]||m[2]).toLowerCase());
    if(new Set(caseClaims).size!==1)continue;
    const explicit=line.match(/\bword\s+(\d{1,3})\b/i);
    const named=words.flatMap((w,i)=>{
      if(!nominalFacts(w))return [];
      const form=corpusArabicSurface(w);if(form.length<3)return [];
      const matches=new Set((line.match(/[\u0621-\u064A\u064B-\u065F\u0670\u0671]{3,}/g)||[])
        .map(normalizeArabic));
      return matches.has(form)?[i]:[];
    });
    const target=explicit&&line.includes(ref)?Number(explicit[1])-1:named.length===1?named[0]:-1;
    if(target<0||found.has(target)||!nominalFacts(words[target]))continue;
    const fact=nominalFacts(words[target])!;
    if(!fact.caseName||fact.caseName===caseClaims[0])continue;
    found.add(target);
    findings.push({quote:line.slice(0,240),
      issue:`Token-aligned nominal case mismatch: claimed ${caseClaims[0]}; annotated ${fact.caseName}.`,
      evidenceRef:`${ref} word ${target+1}`,evidenceQuote:`${words[target].s.map(x=>x[0]).join("")}: ${fact.tags.join("|")}`,
      suggestion:"Correct the case label if the reviewed corpus annotation is supported; assess idaafa membership and syntactic role separately."});
    if(findings.length>=4)break;
  }
  return findings;
}
// Split on sentence and clause delimiters. Do NOT take a grammar label from
// another verb elsewhere in a long sentence (the cause of Q 2:282 false flags).
function units(text:string){return text.split(/(?:[.?!](?=\s|$)|;|\n|[—–])\s*/).map(s=>s.trim()).filter(Boolean);}
function aliases(w:MorphWord){
  const surface=w.s.map(x=>x[0]).join("");
  const stem=w.s.find(([,pos])=>pos==="V")?.[0]||surface;
  const arabic=[surface,stem].map(normalizeArabic).filter(x=>x.length>=3);
  // Do not use a short lemma as a surface-form match: e.g. ra'aA / tara
  // matched unrelated 4:44 descriptions of ishtara (false Form VIII flag).
  const roman=[surface,stem].map(x=>latin(transliterate(x))).filter(x=>x.length>=5);
  return {arabic:[...new Set(arabic)],roman:[...new Set(roman)]};
}
function escapedLiteral(value:string):string{return value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
function matches(unit:string, set:ReturnType<typeof aliases>){
  const ar=normalizeArabic(unit),r=latin(unit);
  return set.arabic.some(x=>new RegExp(`(^|[^\p{L}])${escapedLiteral(x)}(?=$|[^\p{L}])`,"u").test(ar))||set.roman.some(x=>new RegExp(`(^|[^a-z])${escapedLiteral(x)}(?=$|[^a-z])`).test(r));
}
function claimed(unit:string,pattern:RegExp){const result=[...latin(unit).matchAll(pattern)].map(x=>x[1].toLowerCase());return new Set(result).size===1?result[0]:undefined;}
const formRe=/\bform\s+(xii|xi|viii|vii|vi|iv|ix|iii|ii|v|x|i)\b/gi;
const personRe=/\b([123](?:MS|FS|MP|FP|D|M|F|P|S))\b/gi;
const spelledPersonRe=/\b(first|second|third)[ -]person\s+(masculine|feminine)\s+(singular|plural|dual)\b/gi;
const pMap:Record<string,string>={first:"1",second:"2",third:"3",masculine:"M",feminine:"F",singular:"S",plural:"P",dual:"D"};
function assertedPerson(unit:string):string|undefined{
  const numeric=claimed(unit,personRe);
  const textual=[...latin(unit).matchAll(spelledPersonRe)].map(m=>`${pMap[m[1]]}${pMap[m[2]]}${pMap[m[3]]}`);
  const result=new Set([...(numeric?[numeric.toUpperCase()]:[]),...textual]);
  return result.size===1?[...result][0]:undefined;
}
const moodRe=/\b(indicative|subjunctive|jussive|energetic)\b/gi;
const voiceRe=/\b(passive|active)\s+(?:voice|verb|imperfect|perfect)\b/gi;
export function validateGrammarClaims(analysis:string,refs:string|string[],morph:Morphology,corpus:Corpus):GrammarFinding[]{
  const selected=Array.isArray(refs)?refs:[refs];
  const findings:GrammarFinding[]=[];
  const paragraphs=units(analysis);
  const seen=new Set<string>();
  for(const ref of selected){
    const words=morph[ref]||[];
    for(const unit of paragraphs){
      // Comparison-verse properties must name the comparison reference.
      if(ref!==selected[0] && !unit.includes(ref))continue;
      const explicit=unit.match(/\bword\s+(\d{1,3})\b/i);
      const cited=words.flatMap((word,index)=>{
        if(!verbFacts(word)) return [];
        const knownAliases=correctionRecords([ref]).filter(e=>e.id===`${ref}:${index+1}`).flatMap(e=>e.roman_aliases||[]);
        const romanUnit=latin(unit);
        const matchedKnown=knownAliases.some(alias=>{
          const token=latin(alias).replace(/[^a-z]/g,"");
          return token.length>=4 && new RegExp(`(^|[^a-z])${escapedLiteral(token)}(?=$|[^a-z])`).test(romanUnit);
        });
        return matches(unit,aliases(word))||matchedKnown?[index]:[];
      });
      // Explicit word numbers are meaningful only when the current verse is
      // actually identified. Cross-verse prose often says "word 2" elsewhere.
      const target=explicit && unit.includes(ref) ? Number(explicit[1])-1 : cited.length===1 ? cited[0] : -1;
      if(target<0||target>=words.length||!verbFacts(words[target]))continue;
      // No claim may be inherited from neighboring clauses or a list of verbs.
      if(!(explicit && unit.includes(ref)) && cited.length!==1)continue;
      const f=verbFacts(words[target])!;
      const matchedCorrection = correctionRecords([ref]).find(e=>e.id===`${ref}:${target+1}` && e.status==="correction_supported" && e.category==="morphology_mood");
      if (matchedCorrection && typeof matchedCorrection.recommended.mood==="string") f.mood=matchedCorrection.recommended.mood;
      const assertedMood=claimed(unit,moodRe);
      const assertedForm=claimed(unit,formRe)?.toUpperCase();
      const assertedVoice=claimed(unit,voiceRe);
      const assertedPersonTag=assertedPerson(unit);
      let kind="",asserted="",correct="";
      if(assertedMood && f.mood && assertedMood!==f.mood){kind="mood";asserted=assertedMood;correct=f.mood;}
      else if(assertedForm && assertedForm!==f.form){kind="verb form";asserted=`Form ${assertedForm}`;correct=`Form ${f.form}`;}
      else if(assertedVoice && f.voice && assertedVoice!==f.voice){kind="voice";asserted=assertedVoice;correct=f.voice;}
      else if(assertedPersonTag && f.personTag && assertedPersonTag!==f.personTag){kind="person/number/gender";asserted=assertedPersonTag;correct=f.personTag;}
      if(!kind)continue;
      const key=`${ref}:${target+1}:${kind}`;if(seen.has(key))continue;seen.add(key);
      findings.push({quote:unit.slice(0,240),issue:`Token-aligned ${kind} mismatch: claimed ${asserted}; corpus tag ${correct}.`,
        evidenceRef:`${ref} word ${target+1}`,evidenceQuote:`${words[target].s.map(x=>x[0]).join("")}: ${f.tags.join("|")}`,
        suggestion:"Verify the named token against the corpus annotation and the governing Arabic syntax; a tag alone does not establish an interpretation."});
      if(findings.length>=6)return findings;
    }
  }
  findings.push(...explicitNominalCases(analysis, selected[0], morph));
  // Structural grammar guard. Relative mā/allaḏī does not itself license
  // subjunctive or jussive. This is a claim about the stated RULE, not an
  // attempt to override a potentially disputable corpus mood annotation.
  const relativeRule=/\b(?:relative\s+clause|relative\s+pronoun|after\s+ma)\b.{0,110}\b(?:automatically|normally|ordinarily|standard|commonly|apodosis.less|mood)\b.{0,85}\b(?:subjunctive|jussive)\b|\b(?:subjunctive|jussive)\b.{0,65}\b(?:after\s+ma|relative\s+clause)\b/gi;
  for(const m of analysis.matchAll(relativeRule)){
    const quote=m[0];if(seen.has(quote))continue;seen.add(quote);
    findings.push({quote:quote.slice(0,240),issue:"Unsupported syntactic rule: a relative pronoun by itself does not govern subjunctive or jussive mood.",
      evidenceRef:selected[0],evidenceQuote:"Relative clause mood depends on a licensing construction, not relative status alone.",
      suggestion:"Identify the actual governing particle or construction, and verify the finite verb's mood independently."});
    if(findings.length>=6)break;
  }
  return findings;
}
