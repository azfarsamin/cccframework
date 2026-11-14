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
  return {form,mood,voice,aspect,tags};
}
export function deterministicGrammarSheet(ref:string,morph:Morphology):string{
  return (morph[ref]||[]).flatMap((w,i)=>{
    const f=verbFacts(w);if(!f)return [];
    return [`${ref} word ${i+1}: ${w.s.map(x=>x[0]).join("")} [lemma=${w.l||"?"}; root=${w.r||"?"}] `+
      `FORM=${f.form}; ASPECT=${f.aspect||"not annotated"}; VOICE=${f.voice||"not annotated"}; MOOD=${f.mood||"NOT ANNOTATED — do not infer"}`];
  }).join("\n")||"No annotated verbs in the focal verse.";
}
// Split on sentence and clause delimiters. Do NOT take a grammar label from
// another verb elsewhere in a long sentence (the cause of Q 2:282 false flags).
function units(text:string){return text.split(/(?:[.?!](?=\s|$)|;|\n|[—–])\s*/).map(s=>s.trim()).filter(Boolean);}
function aliases(w:MorphWord){
  const surface=w.s.map(x=>x[0]).join("");
  const stem=w.s.find(([,pos])=>pos==="V")?.[0]||surface;
  const arabic=[surface,stem].map(normalizeArabic).filter(x=>x.length>=3);
  const roman=[surface,stem].map(x=>latin(transliterate(x))).filter(x=>x.length>=4);
  return {arabic:[...new Set(arabic)],roman:[...new Set(roman)]};
}
function matches(unit:string, set:ReturnType<typeof aliases>){
  const ar=normalizeArabic(unit),r=latin(unit);
  return set.arabic.some(x=>ar.includes(x))||set.roman.some(x=>new RegExp(`(^|[^a-z])${x}(?=$|[^a-z])`).test(r));
}
function claimed(unit:string,pattern:RegExp){const result=[...latin(unit).matchAll(pattern)].map(x=>x[1].toLowerCase());return new Set(result).size===1?result[0]:undefined;}
const formRe=/\bform\s+(xii|xi|viii|vii|vi|iv|ix|iii|ii|v|x|i)\b/gi;
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
      const cited=words.flatMap((word,index)=>verbFacts(word)&&matches(unit,aliases(word))?[index]:[]);
      const target=explicit?Number(explicit[1])-1:cited.length===1?cited[0]:-1;
      if(target<0||target>=words.length||!verbFacts(words[target]))continue;
      // No claim may be inherited from neighboring clauses or a list of verbs.
      if(!explicit && cited.length!==1)continue;
      const f=verbFacts(words[target])!;
      const assertedMood=claimed(unit,moodRe);
      const assertedForm=claimed(unit,formRe)?.toUpperCase();
      const assertedVoice=claimed(unit,voiceRe);
      let kind="",asserted="",correct="";
      if(assertedMood && f.mood && assertedMood!==f.mood){kind="mood";asserted=assertedMood;correct=f.mood;}
      else if(assertedForm && assertedForm!==f.form){kind="verb form";asserted=`Form ${assertedForm}`;correct=`Form ${f.form}`;}
      else if(assertedVoice && f.voice && assertedVoice!==f.voice){kind="voice";asserted=assertedVoice;correct=f.voice;}
      if(!kind)continue;
      const key=`${ref}:${target+1}:${kind}`;if(seen.has(key))continue;seen.add(key);
      findings.push({quote:unit.slice(0,240),issue:`Token-aligned ${kind} mismatch: claimed ${asserted}; corpus tag ${correct}.`,
        evidenceRef:`${ref} word ${target+1}`,evidenceQuote:`${words[target].s.map(x=>x[0]).join("")}: ${f.tags.join("|")}`,
        suggestion:"Verify the named token against the corpus annotation and the governing Arabic syntax; a tag alone does not establish an interpretation."});
      if(findings.length>=6)return findings;
    }
  }
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
