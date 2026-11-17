/** CCC complete-source research index. Indexed source text is not treated as scripture.
 * Generated JSON stores every paragraph and original line range. No model calls.
 * Section links cover the ENTIRE relevant article, not just top-ranked chunks.
 */
import debt from '../research/index/architecture-of-debt-money-and-interest.json';
import hadith from '../research/index/does-the-quran-endorse-hadith-literature.json';
import halal from '../research/index/halal-and-haram-quranic-perspective.json';
import hadithDistortions from '../research/index/hadith-based-post-facto-distortions.json';
import shams from '../research/index/surah-al-shams-the-self-and-the-balance-of-creation.json';
import preservation from '../research/index/is-the-quran-preserved.json';
import moral from '../research/index/moral-reasoning-in-the-quran.json';
import marriage from '../research/index/quran-hadith-marriageable-age-textual-analysis.json';
import architecture from '../research/index/reason-revelation-and-the-architecture-of-truth.json';
import literacy from '../research/index/reassessing-prophetic-literacy-written-revelation.json';
import gerrans from '../research/index/sam-gerrans-addenda-to-the-quran-a-complete-revelation.json';
import godProtocol from '../research/index/sam-gerrans-the-god-protocol-second-edition.json';

export type FullSourceSection = {id:string;heading:string;level:number;start_line:number;end_line:number;verse_refs:string[];chars:number;sha256:string};
export type FullSourceParagraph = {id:string;section_id:string;line:number;text:string;verse_refs:string[]};
export type FullArticle = {id:string;title:string;source_path:string;source_sha256:string;bytes:number;lines:number;sections:FullSourceSection[];paragraphs:FullSourceParagraph[];verse_to_sections:Record<string,string[]>;indexed_entire_source:boolean};
const all = [debt,hadith,halal,hadithDistortions,preservation,moral,marriage,architecture,literacy,shams,gerrans,godProtocol] as FullArticle[];
const byId = new Map(all.map(a=>[a.id,a]));
export const fullResearchCatalog = all.map(a=>({id:a.id,title:a.title,source:a.source_path,sha256:a.source_sha256,sections:a.sections.length,paragraphs:a.paragraphs.length}));
export function readFullResearchArticle(articleId:string):FullArticle|null {return byId.get(articleId) || null;}
export function readOriginalResearchSection(articleId:string,sectionId:string):{article:FullArticle;section:FullSourceSection;originalText:string}|null {
 const article=byId.get(articleId);const section=article?.sections.find(s=>s.id===sectionId);
 if(!article||!section)return null;
 return {article,section,originalText:article.paragraphs.filter(p=>p.section_id===sectionId).map(p=>p.text).join('\n\n')};
}
/** Find relevant articles and ALL of their source-linked verse references, without a model call.
 * Rank relevant articles by citation of focal verse plus conceptual-overlap tokens.
 * The output is a navigational map, not a substitute for article text.
 */
export function findFullArticleIdsForVerse(verseRef:string,maxArticles=3):string[] {
 return all.map(a=>{
  const sectionIds=a.verse_to_sections[verseRef]||[];
  const headingMatches=a.sections.filter(s=>sectionIds.includes(s.id) && s.heading.includes(verseRef)).length;
  const bodyMentions=a.paragraphs.filter(p=>p.verse_refs.includes(verseRef)).length;
  return {id:a.id,score:sectionIds.length*4+headingMatches*10+Math.min(bodyMentions,12)};
 }).filter(a=>a.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,maxArticles).map(a=>a.id);
}
export function fullArticleEvidenceForVerse(verseRef:string,articleIds:string[],maxRefs=36) {
 const articles=articleIds.map(id=>byId.get(id)).filter((x):x is FullArticle=>Boolean(x));
 const scores=new Map<string,number>();const provenance=new Map<string,string[]>();
 for(const article of articles){
  const direct=new Set(article.verse_to_sections[verseRef]||[]);
  const relatedSections=article.sections.filter(s=>direct.has(s.id));
  const focalWords=new Set(relatedSections.flatMap(s=>s.heading.toLowerCase().match(/[\p{L}]{4,}/gu)||[]));
  for(const s of article.sections){
   const words=(s.heading.toLowerCase().match(/[\p{L}]{4,}/gu)||[]);
   const overlap=words.filter(w=>focalWords.has(w)).length;
   const relevance=direct.has(s.id)?7:overlap?Math.min(5,overlap*2):1;
   for(const r of s.verse_refs){
    if(r===verseRef)continue;
    scores.set(r,(scores.get(r)||0)+relevance);
    const list=provenance.get(r)||[];list.push(s.id);provenance.set(r,list);
   }
  }
 }
 const references=[...scores].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])).slice(0,maxRefs).map(([ref,score])=>({ref,score,sections:[...new Set(provenance.get(ref)||[])]}));
 const articleOutlines=articles.map(a=>({id:a.id,title:a.title,sourceSha256:a.source_sha256,totalSections:a.sections.length,directSections:a.verse_to_sections[verseRef]||[],sections:a.sections.map(s=>({id:s.id,heading:s.heading,verseRefs:s.verse_refs}))}));
 return {articles:articleOutlines,references};
}

/** Select the argument's COMPLETE source sections, not just the first verse-linked
 * headings. Text tables are kept intact (rows and context); never truncate a
 * selected section. A source-navigation heading is not evidence delivered.
 * Selection is generic: direct verse mentions, local section neighborhoods,
 * comparative/morphology/table sections, and non-boilerplate subject headings.
 */
export type RestoredArgumentSection = {
  articleId:string; articleTitle:string; sectionId:string; heading:string;
  text:string; verseRefs:string[]; chars:number; sourceSha256:string;
};
export function restoreArgumentSectionsForVerse(
  verseRef:string, articleIds:string[], maxChars=24000, maxSections=12
):{sections:RestoredArgumentSection[]; omitted:{articleId:string;sectionId:string;heading:string;reason:string}[]; usedChars:number} {
  const scored:{score:number;article:FullArticle;section:FullSourceSection;text:string}[]=[];
  const omitted:{articleId:string;sectionId:string;heading:string;reason:string}[]=[];
  for(const id of [...new Set(articleIds)]){
    const article=byId.get(id);if(!article)continue;
    const direct=new Set(article.verse_to_sections[verseRef]||[]);
    if(!direct.size)continue;
    const directPositions=article.sections.map((s,i)=>direct.has(s.id)?i:-1).filter(i=>i>=0);
    const titledPositions=article.sections.map((s,i)=>
      new RegExp(`(?:^|[^0-9])(?:Q\\s*)?${verseRef.replace(':','\\s*:\\s*')}(?![0-9])`,'i').test(s.heading)?i:-1
    ).filter(i=>i>=0);
    const anchors=titledPositions.length?titledPositions:directPositions;
    for(const [i,section] of article.sections.entries()){
      const text=article.paragraphs.filter(p=>p.section_id===section.id).map(p=>p.text).join('\n\n');
      if(!text.trim())continue;
      const distance=Math.min(...anchors.map(pos=>Math.abs(pos-i)));
      const hd=section.heading.toLowerCase();
      const isTable=/^(?:root\s*\||[^\n]+\|[^\n]+\|)/mi.test(text) || /\btable\b/i.test(text);
      const isComparison=/form\s*[ivx]+|morpholog|reflexiv|causativ|comparative|comparison|semantic|translation|lexic|gramma/i.test(hd);
      const boilerplate=/abstract|introduction|references|bibliograph|conclusion|methodological reflection|keywords/i.test(hd);
      const explicitHeading=anchors.includes(i)&&titledPositions.includes(i);
      const inDirect=direct.has(section.id);
      // The table and the explanatory sections are prioritized when local to
      // the verse's focal discussion, even if their rows lack that verse ID.
      const score=(explicitHeading?160:0)+(inDirect?58:0)
        +(distance<=5?(6-distance)*13:0)
        +(isTable&&distance<=6?95:0)
        +(isComparison&&distance<=6?52:0)
        +(text.includes(verseRef)?20:0)
        -(boilerplate?95:0);
      if(score>=40)scored.push({score,article,section,text});
    }
  }
  scored.sort((a,b)=>b.score-a.score||a.article.id.localeCompare(b.article.id)||a.section.start_line-b.section.start_line);
  let usedChars=0;
  const selected:RestoredArgumentSection[]=[];
  for(const item of scored){
    const length=item.text.length;
    if(selected.length>=maxSections||usedChars+length>maxChars){
      omitted.push({articleId:item.article.id,sectionId:item.section.id,heading:item.section.heading,reason:'argument-context budget'});
      continue;
    }
    selected.push({articleId:item.article.id,articleTitle:item.article.title,sectionId:item.section.id,
      heading:item.section.heading,text:item.text,verseRefs:item.section.verse_refs,
      chars:length,sourceSha256:item.article.source_sha256});
    usedChars+=length;
  }
  // Preserve source order so tables follow their defining premises, while the
  // selection priority above guarantees the comparison table gets admitted.
  selected.sort((a,b)=>a.articleId.localeCompare(b.articleId)||
    (byId.get(a.articleId)?.sections.findIndex(s=>s.id===a.sectionId)||0)-
    (byId.get(b.articleId)?.sections.findIndex(s=>s.id===b.sectionId)||0));
  return {sections:selected,omitted,usedChars};
}
