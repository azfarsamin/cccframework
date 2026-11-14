/** Corpus-anchored, topic-neutral verification of *explicit* morphology claims.
 * This does not interpret Arabic grammar or certify an analysis as correct.
 * It flags contradictions only when the model names a recognizable word and
 * asserts a form/mood/voice that disagrees with a supplied morphological tag.
 */
export type MorphSegment = [string, string, string];
export type MorphWord = { r: string | null; l: string | null; s: MorphSegment[] };
export type Morphology = Record<string, MorphWord[]>;
export type Corpus = Record<string, string>;
export type GrammarFinding = {
  quote: string; issue: string; evidenceRef: string; evidenceQuote: string; suggestion: string;
};
const forms = ["XII", "XI", "VIII", "VII", "III", "VI", "IV", "IX", "II", "V", "X", "I"];
const moodCodes: Record<string,string> = { IND:"indicative", SUBJ:"subjunctive", JUS:"jussive", ENG:"energetic" };
const ignoreArabic = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
function stripArabic(v: string) { return v.normalize("NFKD").replace(ignoreArabic, "").replace(/[إأآٱ]/g,"ا").replace(/ى/g,"ي"); }
// Deliberately conservative romanization; never use this as a translation.
const letters:Record<string,string> = {
  ا:"a",أ:"a",إ:"i",آ:"a",ٱ:"a",ب:"b",ت:"t",ث:"th",ج:"j",ح:"h",خ:"kh",د:"d",ذ:"dh",
  ر:"r",ز:"z",س:"s",ش:"sh",ص:"s",ض:"d",ط:"t",ظ:"z",ع:"",غ:"gh",ف:"f",ق:"q",ك:"k",ل:"l",
  م:"m",ن:"n",ه:"h",و:"w",ي:"y",ى:"a",ة:"a",ء:"",ؤ:"w",ئ:"y", "َ":"a","ُ":"u","ِ":"i","ْ":"","ّ":"",
};
function romanize(v:string) {
  return Array.from(v.normalize("NFC")).map(c=>letters[c] ?? "").join("")
    .replace(/([aiu])\1+/g,"$1").replace(/y?a$/,"a");
}
function plainLatin(v:string) {
  return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[ʾʿ‘’'`ʔ]/g,"").replace(/ḫ/g,"kh").replace(/š/g,"sh").replace(/ḍ/g,"d")
    .replace(/ṣ/g,"s").replace(/ṭ/g,"t").replace(/ẓ/g,"z").replace(/ġ/g,"gh");
}
function verbFacts(word:MorphWord) {
  const verbal = word.s.find(([,pos]) => pos === "V");
  if (!verbal) return null;
  const tags = verbal[2].split("|").filter(Boolean);
  const form = forms.find(f => tags.includes(`(${f})`)) || "I";
  const moodRaw = tags.find(t=>t.startsWith("MOOD:"))?.slice(5) || tags.find(t=>Object.keys(moodCodes).includes(t));
  const mood = moodRaw ? moodCodes[moodRaw] : undefined;
  const voice = tags.includes("PASS") ? "passive" : tags.includes("ACT") ? "active" : undefined;
  const aspect = tags.includes("IMPF") ? "imperfect" : tags.includes("PERF") ? "perfect" : tags.includes("IMPV") ? "imperative" : undefined;
  return { form, mood, voice, aspect, tags };
}
export function deterministicGrammarSheet(ref:string,morph:Morphology):string {
  return (morph[ref] || []).flatMap((w,i)=> {
    const f = verbFacts(w); if (!f) return [];
    return [`${ref} word ${i+1}: ${w.s.map(x=>x[0]).join("")} [lemma=${w.l||"?"}; root=${w.r||"?"}] ` +
      `FORM=${f.form}; ASPECT=${f.aspect||"not annotated"}; VOICE=${f.voice||"not annotated"}; MOOD=${f.mood||"NOT ANNOTATED — do not infer"}`];
  }).join("\n") || "No annotated verb forms in the focal verse.";
}
function candidateSegments(text:string) { return text.split(/(?<=[.;\n])\s+|\n+/).filter(Boolean); }
function wordAliases(word:MorphWord, wordNumber:number, verse:string) {
  const pieces=word.s.map(x=>x[0]);
  const textToken=verse.trim().split(/\s+/)[wordNumber] || "";
  const surface=pieces.join("");
  const aliases = [textToken, surface].filter(Boolean);
  const arabic = aliases.filter(a=>/[\u0600-\u06FF]/.test(a));
  const roman = arabic.map(romanize).filter(a=>a.length>=4);
  return {arabic:arabic.map(stripArabic), roman:[...new Set(roman.map(plainLatin))]};
}
function containsAlias(segment:string,aliases:ReturnType<typeof wordAliases>) {
  const arabic=stripArabic(segment);
  if (aliases.arabic.some(a=>a.length>=3 && arabic.includes(a))) return true;
  const roman=plainLatin(segment);
  return aliases.roman.some(a=>a.length>=4 && new RegExp(`(^|[^a-z])${a}(?=$|[^a-z])`).test(roman));
}
function claimedMood(segment:string):string|undefined {
  const matches=plainLatin(segment).match(/\b(indicative|subjunctive|jussive|energetic)\b/g) || [];
  return [...new Set(matches)].length===1 ? matches[0] : undefined;
}
function claimedForm(segment:string):string|undefined {
  const formsInText=[...plainLatin(segment).matchAll(/\bform\s+(xii|xi|viii|vii|vi|iv|ix|iii|ii|v|x|i)\b/g)].map(m=>m[1].toUpperCase());
  return [...new Set(formsInText)].length===1 ? formsInText[0] : undefined;
}
function claimedVoice(segment:string):string|undefined {
  const m=plainLatin(segment).match(/\b(active|passive)\s+(?:voice|verb|imperfect|perfect)\b|\b(?:verb|voice|imperfect|perfect)\s+(active|passive)\b/);
  return m ? (m[1]||m[2]) : undefined;
}
export function validateGrammarClaims(analysis:string, refs:string|string[], morph:Morphology, corpus:Corpus):GrammarFinding[] {
  const results:GrammarFinding[]=[];
  const selected = Array.isArray(refs) ? refs : [refs];
  const paragraphs = candidateSegments(analysis);
  for (const ref of selected) {
    const words=morph[ref]||[]; const text=corpus[ref]||"";
    for (const [i,word] of words.entries()) {
      const fact=verbFacts(word); if (!fact) continue;
      const alias=wordAliases(word,i,text);
      if (!alias.arabic.length && !alias.roman.length) continue;
      for (const phrase of paragraphs) {
        // For comparison verses require an explicit reference in the same
        // sentence; otherwise a shared word could falsely borrow its tags.
        if (ref !== selected[0] && !phrase.includes(ref)) continue;
        if (!containsAlias(phrase,alias)) continue;
        const normalized=plainLatin(phrase);
        if (/\b(not|incorrect(?:ly)?|wrong(?:ly)?|rather than|isn't|doesn't)\b/.test(normalized) && normalized.length<170) continue;
        const assertedMood=claimedMood(phrase);
        const assertedForm=claimedForm(phrase);
        const assertedVoice=claimedVoice(phrase);
        let kind="", asserted="", correct="";
        // Absence of a mood tag is NOT evidence of the indicative.
        if (assertedMood && fact.mood && assertedMood!==fact.mood) {
          kind="mood"; asserted=assertedMood; correct=fact.mood;
        } else if (assertedForm && assertedForm!==fact.form) {
          kind="verb form"; asserted=`Form ${assertedForm}`; correct=`Form ${fact.form}`;
        } else if (assertedVoice && fact.voice && assertedVoice!==fact.voice) {
          kind="voice"; asserted=assertedVoice; correct=fact.voice;
        }
        if (!kind) continue;
        // Avoid authoritatively matching a paragraph with multiple verb forms.
        // If the paragraph lists multiple possible labels, only flag when a
        // short single-claim segment identifies exactly one target verb.
        if (phrase.length>310 || (phrase.match(/\bform\s+(?:I|V|X)/gi)||[]).length>1) continue;
        const source=word.s.map(s=>s[0]).join("");
        results.push({quote:phrase.slice(0,240),issue:`Corpus ${kind} mismatch: claimed ${asserted}; annotated ${correct}.`,
          evidenceRef:`${ref} word ${i+1}`,evidenceQuote:`${source}: ${fact.tags.join("|")}`,
          suggestion:`Recheck ${kind} against the local morphological annotation before treating this grammatical claim as established.`});
        if(results.length>=6) return results;
      }
    }
  }
  return results;
}
