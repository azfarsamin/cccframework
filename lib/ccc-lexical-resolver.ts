/** Corpus-backed lexical resolution. No model, fixed word list, or guessed zero counts. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { buckwalterToArabic, normalizeRoot, type Morphology } from "./ccc-corpus-search";
import type { QueryPlan } from "./ccc-query-planner";

export type LexicalResolution =
  | { status: "resolved"; plan: Extract<QueryPlan,{kind:"lemma"}>; matchedArabic: string }
  | { status: "unresolved"; term: string; reason: string; suggestions: string[] }
  | { status: "not-lexical" };

const diacritics = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
function arabicKey(x: string): string {
  return normalizeRoot(x.replace(diacritics, "")).replace(/ة/g, "ه");
}
function romanKey(x: string): string {
  return x.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/ʿ|‘|’|ʾ|ʼ/g, "'")
    .replace(/sh/g, "$ ").replace(/kh/g, "x ").replace(/gh/g, "g ")
    .replace(/dh/g, "* ").replace(/th/g, "v ")
    .replace(/\s/g, "")
    .replace(/[-_]/g, "").replace(/aa/g, "a").replace(/ee/g, "i").replace(/oo/g, "u")
    .replace(/ou/g, "u").replace(/ei/g, "i").replace(/iy/g, "i")
    .replace(/y/g, "i").replace(/w/g, "u")
    .replace(/[~o`^FNK{}<>|&]/g, "").replace(/p/g, "h")
    .replace(/v/g, "th").replace(/\$/g, "sh").replace(/\*/g, "dh")
    .replace(/x/g, "kh").replace(/g(?=h)/g, "g")
    .replace(/([aeiou])\1+/g, "$1").replace(/'/g, "");
}
// Roman spellings generated from annotated Buckwalter rather than a small
// handwritten list. Buckwalter-specific characters are normalized below.
function lemmaRoman(buckwalter: string): string {
  let t = buckwalter.replace(/H/g,"h").replace(/S/g,"s").replace(/D/g,"d")
    .replace(/T/g,"t").replace(/Z/g,"z").replace(/E/g,"'")
    .replace(/A/g,"a").replace(/Y/g,"a").replace(/q/g,"q")
    .replace(/\{/g,"a").replace(/\}/g,"i").replace(/>/g,"a").replace(/</g,"i")
    .replace(/&/g,"u").replace(/\|/g,"a")
    .replace(/a(?=p)/g,"a");
  return romanKey(t);
}
const LEXICAL_FRAME = /\b(?:all\s+(?:the\s+)?(?:occurrences?|mentions?|uses?|instances?)|every\s+(?:occurrence|mention|use)|(?:list|show|find|provide|give|count|enumerate)\b[^.!?]{0,65}\b(?:occurrences?|mentions?|instances?|uses?|word|term|lemma)|\b(?:word|term|lemma|root)\b)\b/i;
const LATIN_CAPTURE = /(?:\b(?:word|term|lemma)\s+(?:of\s+|for\s+|is\s+|['“"])?|\b(?:occurrences?|mentions?|uses?|instances?)\s+of\s+(?:the\s+word\s+)?|\bevery\s+(?:occurrence|mention|use)\s+of\s+)([\p{L}\p{M}ʿʾ‘’'-]+)/iu;
const ARABIC_CAPTURE = /[\u0621-\u064A\u0671-\u0674][\u0621-\u065F\u0670\u0671-\u0674\u0640]*/u;
function extractLexicalTerm(question:string): string | null {
  if (!LEXICAL_FRAME.test(question)) return null;
  const arabic = question.match(ARABIC_CAPTURE)?.[0];
  if (arabic) return arabic;
  const direct = question.match(LATIN_CAPTURE)?.[1];
  if (direct && !/^(?:the|a|an|quran|qur'an|qurʾan|holy|all|its)$/i.test(direct)) return direct;
  return null;
}

type Lexeme = { lemma: string; arabic: string; occurrences: number; roman: string };
let lexiconPromise: Promise<Lexeme[]> | undefined;
async function lexicon(): Promise<Lexeme[]> {
  lexiconPromise ??= readFile(path.join(process.cwd(),"public/data/morphology.json"),"utf8")
    .then(raw=>JSON.parse(raw) as Morphology).then(data=>{
      if(Object.keys(data).length!==6236)throw Error("Incomplete morphology index");
      const counts=new Map<string,number>();
      for(const words of Object.values(data))for(const w of words) if(w.l)counts.set(w.l,(counts.get(w.l)||0)+1);
      return [...counts].map(([lemma,occurrences])=>({lemma,occurrences,arabic:buckwalterToArabic(lemma),roman:lemmaRoman(lemma)}));
    }).catch(e=>{lexiconPromise=undefined;throw e;});
  return lexiconPromise;
}
export async function resolveLexicalQuery(question:string):Promise<LexicalResolution> {
  const raw=extractLexicalTerm(question);
  if(!raw)return {status:"not-lexical"};
  const lexemes=await lexicon();
  const ar=/[\u0600-\u06FF]/.test(raw);
  const key=ar?arabicKey(raw):romanKey(raw);
  if(!key)return {status:"unresolved",term:raw,reason:"Empty lexical term after normalization",suggestions:[]};
  const matches=lexemes.filter(v=>ar?arabicKey(v.arabic)===key:v.roman===key);
  if(matches.length===1){const match=matches[0];return {status:"resolved",plan:{kind:"lemma",lemma:match.lemma,label:`${raw} (${match.arabic})`,analysis:false,scope:"exact-lemma"},matchedArabic:match.arabic};}
  // A matching token is not assumed if the lemma is ambiguous or absent.
  // Give corpus-derived alternatives but no fabricated zero-occurrence claim.
  const suggestions=(matches.length?matches:lexemes.filter(v=>
    ar?arabicKey(v.arabic).startsWith(key):v.roman.startsWith(key))).slice(0,10).map(v=>`${v.arabic} (${v.lemma}; ${v.occurrences})`);
  return {status:"unresolved",term:raw,reason:matches.length>1?"Multiple indexed lemmas share this spelling":"No unambiguous indexed lemma matches this spelling",suggestions};
}
