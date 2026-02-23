export default function WorkPage() {
  return (
    <>
      <div className="kicker">Books • analysis • applied thinking</div>
      <h1>Work</h1>
      <p className="muted">
        Selected published work and areas of analysis. This page will evolve into case-style breakdowns.
      </p>

      <div className="grid two">
        <div className="card">
          <h2>Books</h2>
          <ul className="list">
            <li><strong>The Architecture of Debt-Money and Interest</strong></li>
            <li><strong>Reason, Revelation, and the Architecture of Truth</strong> (CCC foundations)</li>
          </ul>
          <p className="muted">
            (We can add cover images, blurbs, and purchase links once you’re ready.)
          </p>
        </div>

        <div className="card">
          <h2>Domains I analyze</h2>
          <ul className="list">
            <li>Economic system design and failure modes</li>
            <li>Incentives, metrics, and unintended consequences</li>
            <li>AI systems: behavior, evaluation, and drift</li>
            <li>Epistemology and decision frameworks</li>
          </ul>
        </div>
      </div>

      <div className="hr" />

      <div className="card">
        <h2>Next additions (optional)</h2>
        <ul className="list">
          <li>3–5 “mini case studies” (1 page each)</li>
          <li>One CCC diagram and a “how I work” flow</li>
          <li>Short example deliverables (redacted)</li>
        </ul>
      </div>
    </>
  );
}
