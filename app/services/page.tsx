import Link from "next/link";

export default function ServicesPage() {
  return (
    <>
      <div className="kicker">Clear deliverables • scoped engagements</div>
      <h1>Services</h1>
      <p className="muted">
        Practical analysis with structured outputs. If you’re not sure what you need, start with a diagnostic.
      </p>

      <div className="grid two">
        <div className="card">
          <h2>Systems & Gap Analysis</h2>
          <p>
            Deep structural breakdown of a problem space to identify root causes, hidden assumptions,
            contradictions, and leverage points.
          </p>
          <ul className="list">
            <li>System map + failure modes</li>
            <li>Assumption audit</li>
            <li>Priority leverage points</li>
          </ul>
        </div>

        <div className="card">
          <h2>Strategy Modeling (First Principles)</h2>
          <p>
            Build a decision framework that remains stable under complexity, incentives, and uncertainty.
          </p>
          <ul className="list">
            <li>Option comparison</li>
            <li>Constraints & invariants</li>
            <li>Action plan and checkpoints</li>
          </ul>
        </div>

        <div className="card">
          <h2>Research Synthesis</h2>
          <p>
            High-signal synthesis of a large information space into a coherent model you can use.
          </p>
          <ul className="list">
            <li>Structured summary</li>
            <li>Key controversies and assumptions</li>
            <li>Decision implications</li>
          </ul>
        </div>

        <div className="card">
          <h2>Diagnostic Audit (Best starting point)</h2>
          <p>
            A fast, scoped engagement to clarify the real problem and the best next move.
          </p>
          <ul className="list">
            <li>30–60 minute intake</li>
            <li>Written findings</li>
            <li>Recommended path forward</li>
          </ul>
        </div>
      </div>

      <div className="hr" />

      <div className="card">
        <h2>Engagement style</h2>
        <ul className="list">
          <li>Scoped deliverables (no open-ended “brain dumping”)</li>
          <li>Clarity-first communication</li>
          <li>CCC-based stress testing (coherence, correspondence, calibration)</li>
        </ul>
        <div className="ctaRow">
          <Link className="button primary" href="/contact">Contact</Link>
        </div>
      </div>
    </>
  );
}
