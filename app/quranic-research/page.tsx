import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Qurʾānic Research | CCC Framework",
  description: "Applying Coherence, Correspondence, and Calibration to Qurʾānic research, with a link to the OnlyQuran.org research engine.",
};

function LayersIcon() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m24 5 18 10-18 10L6 15 24 5Z"/><path d="m6 24 18 10 18-10"/><path d="m6 33 18 10 18-10"/></svg>;
}
function BookIcon() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M24 11C17 6 10 6 4 8v31c7-3 14-2 20 3 6-5 13-6 20-3V8c-6-2-13-2-20 3Z"/><path d="M24 11v31"/></svg>;
}
function SearchIcon() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><circle cx="20" cy="20" r="13"/><path d="m30 30 13 13"/></svg>;
}
function TargetIcon() {
  return <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="24" cy="24" r="16"/><circle cx="24" cy="24" r="8"/><path d="M24 2v11M24 35v11M2 24h11M35 24h11"/></svg>;
}

export default function QuranicResearchPage() {
  return (
    <article className="qresearchPage">
      <div className="qresearchKicker">Research Application · Qurʾān</div>
      <h1>Qurʾānic Research</h1>
      <p className="qresearchLead">A Qurʾān-centric research project that applies the Coherence–Correspondence–Calibration (CCC) Framework to examine the text, its message, and its historical context.</p>

      <section className="qresearchMethod" aria-label="Relationship between framework and research">
        <div className="qresearchMethodPart">
          <div className="qresearchMethodIcon"><LayersIcon /></div>
          <h2>CCC Framework</h2>
          <p>The method</p>
          <span>Coherence · Correspondence · Calibration</span>
        </div>
        <div className="qresearchMethodArrow" aria-hidden="true">→</div>
        <div className="qresearchMethodPart">
          <div className="qresearchMethodIcon"><BookIcon /></div>
          <h2>Qurʾānic Research</h2>
          <p>The application</p>
          <span>Systematic, text-based inquiry into the Qurʾān</span>
        </div>
      </section>

      <section className="qresearchSection">
        <h2>Research Focus</h2>
        <ul className="qresearchFocus">
          <li><BookIcon /><span>Text and message: language, structure, and internal coherence</span></li>
          <li><SearchIcon /><span>Historical correspondence: what the text aligns with in the real world</span></li>
          <li><LayersIcon /><span>Competing claims: systematic and evidence-based evaluation</span></li>
          <li><TargetIcon /><span>Calibration: testing interpretations and revising when evidence diverges</span></li>
        </ul>
      </section>

      <section className="qresearchSection qresearchExplore">
        <h2>Explore the Qurʾān</h2>
        <p>Use the Qurʾān Research Engine for verse analysis, Arabic morphology, and CCC-based interpretation (Qurʾān-only, no hadith or later doctrinal sources).</p>
        <div className="qresearchLaunch">
          <a className="qresearchLaunchLink" href="https://onlyquran.org/publicquran" target="_blank" rel="noopener noreferrer">Launch the Qurʾān Research Engine <span aria-hidden="true">↗</span></a>
          <span className="qresearchDomain">onlyquran.org</span>
        </div>
      </section>
    </article>
  );
}
