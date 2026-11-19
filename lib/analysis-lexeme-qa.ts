/** Deterministic, advisory QA anchored in the local corpus. Never edit source text. */
export type LexemeFinding = {quote:string;issue:string;evidenceRef:string;evidenceQuote:string;suggestion:string};
export type QaMorphWord = {r:string|null;l:string|null;s:[string,string,string][]};
export type QaMorphology = Record<string,QaMorphWord[]>;
export type QaCorpus = Record<string,string>;
const arabicMarks = /[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
const arabicNormal = (s:string) => s.normalize('NFKD').replace(arabicMarks,'').replace(/[إأآٱ]/g,'ا').replace(/ى/g,'ي');
const tokens = (s:string) => (s.match(/[\u0621-\u064A\u0671\u064B-\u065F\u0670\u06D6-\u06ED]+/g)||[]).map(arabicNormal).filter(x=>x.length>=4);
const buck:Record<string,string> = {"'":"ء","|":"آ",">":"أ","&":"ؤ","<":"إ","}":"ئ",A:"ا",b:"ب",p:"ة",t:"ت",v:"ث",j:"ج",H:"ح",x:"خ",d:"د","*":"ذ",r:"ر",z:"ز",s:"س","$":"ش",S:"ص",D:"ض",T:"ط",Z:"ظ",E:"ع",g:"غ",f:"ف",q:"ق",k:"ك",l:"ل",m:"م",n:"ن",h:"ه",w:"و",Y:"ى",y:"ي","{":"ٱ"};
const surface=(w:QaMorphWord)=>arabicNormal(w.s.map(([s])=>[...s].map(c=>buck[c]||'').join('')).join(''));
const stem=(w:QaMorphWord)=>w.s.find(([,p])=>p==='N'||p==='ADJ'||p==='V'||p==='PN');
function differenceOne(a:string,b:string):boolean {
 if(a===b || Math.abs(a.length-b.length)>1)return false;
 let i=0,j=0,edits=0;
 while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>b.length)i++;else if(a.length<b.length)j++;else{i++;j++;}}
 return edits+Number(i<a.length||j<b.length)===1;
}
/** Surface-form precision is essential: the upstream corpus tags 7:43 ghill and
 * 7:157 aghlāl with the SAME lemma gil~, but their different forms and senses
 * must never be conflated as 'shackles at 7:43'. */
export function verifyGhillAghlalSeparation(analysis:string, reference:string):LexemeFinding[] {
 if(reference!=='7:157')return [];
 const parts=analysis.split(/(?<=[.!?])\s+|\n+/);
 const mistaken=parts.find(s=>/(?:aghl[aā]l|ٱ?لْأَغْلَـ?ٰ?ل|الأغلال|shackles|fetters)/iu.test(s)&&/7:43/.test(s)&&
   /(?:lemma|cluster|occurrences?|appears?|instances?|includes?|same\s+word|shackles|fetters)/i.test(s)&&
   !/(?:different|distinct|not\s+(?:the\s+)?same|root\s+only|rather\s+than|contrasts?)/i.test(s));
 const findings:LexemeFinding[]=[];
 if(mistaken)findings.push({quote:mistaken.trim().slice(0,240),
  issue:'7:43 contains singular ghill (rancour), not the plural aghlāl (fetters); both share the indexed lemma gil~ but are not interchangeable lexical senses.',
  evidenceRef:'7:43',evidenceQuote:'غِلّ',suggestion:'Distinguish attested surface forms, number and contextual sense even when the corpus lists one shared lemma.'});
 const wrongPlural=parts.find(s=>/(?:khab[aā]ʾith|khab[aā]ith|خَبَـ?ٰ?ٓ?ئِثَ|الخبائث)/iu.test(s)&&
  /(?:masculine\s+plural|\bMP\s+accusative|\bMP\b[^.]{0,35}accusative)/i.test(s));
 if(wrongPlural)findings.push({quote:wrongPlural.trim().slice(0,240),issue:'al-khabāʾith is a broken plural; MP does not establish a masculine sound-plural construction.',evidenceRef:'7:157',evidenceQuote:'ٱلْخَبَـٰٓئِثَ',suggestion:'Distinguish broken-plural pattern from agreement/case features.'});
 return findings;
}
/** Strict, low-noise near-match check for Arabic quotations in the grammar section.
 * Requires an otherwise unique focal-verse token differing by exactly one letter.
 * Advisory only: the researcher decides whether a near-match is a bad quotation. */
export function verifyArabicQuotations(analysis:string,ref:string,morph:QaMorphology,corpus:QaCorpus):LexemeFinding[] {
 const section=(analysis.split(/(?:^|\n)##?\s*1\.\s*Grammar and morphology/i)[1]||'').split(/(?:^|\n)##?\s*2\./)[0];
 const words=morph[ref]||[];
 if(!section||!words.length)return [];
 const inventory=words.map((w,i)=>({word:surface(w),index:i+1})).filter(w=>w.word.length>=5);
 const canonicalTokens=new Set(tokens(corpus[ref]||''));
 const findings:LexemeFinding[]=[];const seen=new Set<string>();
 for(const unit of section.split(/[\n.;]/).filter(Boolean)){
  for(const printed of tokens(unit)){
   if(canonicalTokens.has(printed)||seen.has(printed))continue;
   const candidates=inventory.filter(w=>differenceOne(printed,w.word));
   if(candidates.length!==1)continue;
   const target=candidates[0];
   // A quote of a similar word from another cited verse is not a transcription error.
   if(/\b\d{1,3}:\d{1,3}\b/.test(unit) && !unit.includes(ref))continue;
   seen.add(printed);
   findings.push({quote:unit.trim().slice(0,240),
    issue:`Possible incorrect Arabic token: ${printed} differs by one letter from the focal verse's word ${target.index}.`,
    evidenceRef:`${ref} word ${target.index}`,evidenceQuote:target.word,
    suggestion:`Verify the quoted word against the complete canonical spelling in ${ref}; do not silently rewrite the generated analysis.`});
   if(findings.length>=3)return findings;
  }
 }
 return findings;
}
/** Check a narrowly scoped set of objective morphosyntactic errors in 7:157.
 * These are evidence-review findings and do not rewrite the generated answer. */
export function verifyGrammarDescriptions(analysis:string,reference:string):LexemeFinding[] {
  // Reusable descriptive checks: specific verified lexical classifications are
  // keyed by attested surface, NOT inferred from an MP gender/number annotation.
  const findings:LexemeFinding[]=[];
  const chunks=analysis.split(/\n|(?<=[.!?])\s+(?=[A-Zأ-يٱ])/);
  const add=(sentence:string,issue:string,arabic:string,suggestion:string)=> {
    if(findings.some(f=>f.issue===issue))return;
    findings.push({quote:sentence.trim().slice(0,240),issue,evidenceRef:reference,evidenceQuote:arabic,suggestion});
  };
  for(const sentence of chunks) {
    if(/(?:participial predicate|active participle)/i.test(sentence) && /(?:يَتَّبِعُونَ|yattabi[ʿ']?ūna)/i.test(sentence))
      add(sentence,'yattabiʿūna is a finite Form VIII imperfect verb, not a participle.','يَتَّبِعُونَ','Describe its finite imperfect verb and relative-clause predicate function.');
    if(/(?:muḍāf ilayh|mudaf ilayh|idafa|iḍāfa)/i.test(sentence) && /(?:fī|فِى|preposition)/i.test(sentence) && /(?:tawr|torah|injīl|إِنجِيل|تَّوْرَى)/i.test(sentence))
      add(sentence,'fī governs genitive by preposition; a preposition does not have a muḍāf ilayh.','فِى ٱلتَّوْرَىٰةِ وَٱلْإِنجِيلِ','Describe the prepositional genitive, not iḍāfa.');
    if(/(?:masculine plural|\bMP\b)/i.test(sentence) && /(?:khab[aā][ʾ']?ith|خَبَـٰٓئِث|خَبَائِث)/i.test(sentence))
      add(sentence,'al-khabāʾith is a broken plural; do not classify it as a masculine sound plural.','ٱلْخَبَـٰٓئِثَ','Use broken plural, accusative; distinguish corpus gender tag from morphological plural pattern.');
    if(/(?:ٱتََّبَعُوا|يَتََّبِعُونَ)/u.test(sentence))
      add(sentence,'The Arabic word is misspelled with duplicated diacritics.','ٱتَّبَعُوا۟ / يَتَّبِعُونَ','Quote the exact Arabic from the canonical verse text.');
    // The Arabic Corpus's MP feature should never be presented as a sound
    // masculine plural pattern. The pattern is a lexical property, not a gender
    // agreement label. Apply only when an unambiguous sound-plural claim is made.
    if (/\b(?:sound|regular)\s+masculine\s+plural\b/i.test(sentence) &&
        /(?:khab[aā][ʾ']?ith|خَبَـٰٓئِث|خَبَائِث)/i.test(sentence))
      add(sentence,'The documented khabāʾith form is a broken plural, not a sound masculine plural.','ٱلْخَبَـٰٓئِثَ','Describe plural formation separately from corpus grammatical gender/number.');
    if(findings.length>=4) break;
  }
  return findings;
}
/** Verify claims of identical morphology against the two actual corpus forms.
 * A common root is not a shared morphosyntactic category. */
export function verifyMorphologyEquivalence(analysis:string,ref:string,morph:QaMorphology):LexemeFinding[] {
 if(ref!=='7:157')return [];
 const samples=analysis.split(/(?<=[.!?])\s+|\n+/);
 const found=samples.find(s=>/(?:makt[uū]ban|مَكْتُوبًا)/i.test(s)&&/(?:iktatabah[aā]|ٱكْتَتَبَهَا)/i.test(s)&&
  /(?:same\s+(?:participial|morphological)|identical\s+(?:participial|morphological)|both\s+(?:participles|participial))/i.test(s));
 if(!found)return [];
 const one=morph['7:157']?.find(w=>w.s.some(([t])=>t.includes('makotuwb')));
 const two=morph['25:5']?.find(w=>w.l==='{kotataba');
 if(!one||!two)return [];
 const f=stem(one),s=stem(two);
 const participle=f?.[2].includes('PCPL');const finite=s?.[1]==='V';
 if(!participle||!finite)return [];
 return [{quote:found.trim().slice(0,240),issue:'Shared root k-t-b does not mean identical morphology: maktūban is a passive participle; iktatabahā is a Form VIII finite perfect verb.',
  evidenceRef:'7:157 / 25:5',evidenceQuote:`${f![2]} | ${s![2]}`,suggestion:'Describe a common root while distinguishing participial and finite-verb morphology.'}];
}
