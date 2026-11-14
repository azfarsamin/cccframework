"use client";

import { useState } from "react";

type Hit = {
  id: string; articleId: string; title: string; section: string;
  verseRefs: string[]; text: string; score: number;
  evidenceRole: string; externalDiscussion: boolean;
};
export default function ResearchLibraryPage() {
  const [q, setQ] = useState("");
  const [ref, setRef] = useState("");
  const [passcode, setPasscode] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [searched, setSearched] = useState(false);
  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSearched(true); setPending(true);
    try {
      const args = new URLSearchParams();
      if (q.trim()) args.set("q", q.trim());
      if (ref.trim()) args.set("ref", ref.trim());
      const res = await fetch(`/api/research-search?${args}`, { headers: { "x-ccc-passcode": passcode }, cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Search failed (${res.status})`);
      setHits(data.hits || []);
    } catch (e) { setError(e instanceof Error ? e.message : "Search failed"); setHits([]); }
    finally { setPending(false); }
  }
  return (
    <main style={{maxWidth:960,margin:"32px auto",padding:"0 20px",fontFamily:"system-ui,sans-serif",lineHeight:1.55}}>
      <h1 style={{fontSize:28,marginBottom:6}}>CCC Research Library</h1>
      <p style={{opacity:.8,marginTop:0}}>Search authored research by Qurʾānic verse, subject, Arabic term, or phrase. Article claims are attributed research, not primary Qurʾānic evidence.</p>
      <form onSubmit={search} style={{display:"grid",gridTemplateColumns:"minmax(180px,1fr) 130px minmax(150px,1fr) auto",gap:10,marginBottom:22}}>
        <input aria-label="Keywords" placeholder="e.g. marriage, nisa, maturity" value={q} onChange={e=>setQ(e.target.value)} style={{padding:10,border:"1px solid #888",borderRadius:7,minWidth:0}} />
        <input aria-label="Verse reference" placeholder="e.g. 65:4" value={ref} onChange={e=>setRef(e.target.value)} style={{padding:10,border:"1px solid #888",borderRadius:7,minWidth:0}} />
        <input aria-label="Research passcode" type="password" autoComplete="off" placeholder="Research passcode" value={passcode} onChange={e=>setPasscode(e.target.value)} style={{padding:10,border:"1px solid #888",borderRadius:7,minWidth:0}} />
        <button disabled={pending||(!q.trim()&&!ref.trim())} style={{padding:"10px 16px",borderRadius:7,background:"#234",color:"white",cursor:"pointer"}}>{pending?"Searching…":"Search"}</button>
      </form>
      {error && <p role="alert" style={{color:"#b33"}}>{error}</p>}
      {searched && !pending && !error && <p>{hits.length ? `${hits.length} matching excerpts` : "No matching excerpts"}</p>}
      <div style={{display:"grid",gap:16}}>
        {hits.map(hit => <article key={hit.id} style={{border:"1px solid #9996",borderRadius:10,padding:18}}>
          <h2 style={{fontSize:17,margin:"0 0 4px"}}>{hit.section}</h2>
          <p style={{fontSize:13,opacity:.7,margin:"0 0 10px"}}>{hit.title} · {hit.id}</p>
          <p style={{fontSize:13,margin:"0 0 10px"}}>Verses: {hit.verseRefs.slice(0,18).join(", ") || "None tagged"} · {hit.externalDiscussion ? "External-source discussion" : "Qurʾān-centred article argument"}</p>
          <details><summary style={{cursor:"pointer"}}>Read indexed excerpt</summary><p style={{whiteSpace:"pre-wrap",marginTop:12}}>{hit.text}</p></details>
        </article>)}
      </div>
    </main>
  );
}
