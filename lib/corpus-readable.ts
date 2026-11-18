/** Presentation-only decoding of Quranic Arabic Corpus extended Buckwalter.
 * Original JSON and correction annotations remain unchanged. Do not infer syntax
 * or semantic agency from a transliterated display string.
 */
export type CorpusMorphWord = {r:string|null;l:string|null;s:[string,string,string][]};
const MAP:Record<string,string>={
  A:"ا",b:"ب",t:"ت",v:"ث",j:"ج",H:"ح",x:"خ",d:"د","*":"ذ",r:"ر",z:"ز",s:"س","$":"ش",S:"ص",D:"ض",T:"ط",Z:"ظ",E:"ع",g:"غ",f:"ف",q:"ق",k:"ك",l:"ل",m:"م",n:"ن",h:"ه",w:"و",y:"ي","<":"إ",">":"أ","&":"ؤ","}":"ئ",p:"ة",Y:"ى","|":"آ","{":"ٱ",X:"خ",
  a:"َ",i:"ِ",u:"ُ",o:"ْ","~":"ّ",F:"ً",N:"ٌ",K:"ٍ","`":"ٰ","^":"ٓ","'":"ء","@":"۟",
};
// Many extended orthographic marks (pause/verse signs) do not have a stable
// reader-facing romanization. Arabic verse text is authoritative for display.
export function corpusEncodingToArabic(encoded:string):string {
  return [...encoded].map(ch=>MAP[ch]??(ch.match(/[\[\],.#;:%!+_"-]/)?"":ch)).join("");
}
export function safeArabicWord(words:string[], index:number, word:CorpusMorphWord, total:number):string {
  // Never shift word attribution when the orthographic and morphology token
  // counts differ (four known verses in this snapshot).
  if(words.length===total && words[index]) return words[index];
  return word.s.map(([surface])=>corpusEncodingToArabic(surface)).join("");
}
export function readableMorphologyLine(word:CorpusMorphWord,index:number,arabicWord:string):string {
  const segments=word.s.map(([surface,pos,features])=>{
    const tags=features.split("|").filter(t=>
      /^(?:PERF|IMPF|IMPV|PASS|ACT|NOM|ACC|GEN|MS|MP|FS|FP|M|F|DU|INDEF|DEF|PCPL|\([IVX]+\)|MOOD:[A-Z]+|[123](?:MS|MP|FS|FP|D|S|P))$/.test(t));
    return `${corpusEncodingToArabic(surface)}{${pos}${tags.length?";"+tags.join(","):""}}`;
  }).join("+");
  return `${index+1} ${arabicWord} [root=${word.r?corpusEncodingToArabic(word.r):"—"}; lemma=${word.l?corpusEncodingToArabic(word.l):"—"}] ${segments}`;
}
