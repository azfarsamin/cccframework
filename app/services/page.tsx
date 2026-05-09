import Link from "next/link";

export default function ServicesPage() {
  return (
    <>
      <div className="kicker">First-principles • Systems thinking • Architecture</div>
      <h1>Articles</h1>
      <p className="muted">
        Practical analysis with structured reasoning from first principles. Looking at truth as a whole as opposed to individual parts. 
      </p>

      <div className="grid two">
        <div className="card">
          <h2>Outsourced Thinking or Misplaced Anxiety?</h2>
          <p>
            A CCC-based analysis arguing that the real risk of AI is not automation of thinking, but epistemic surrender.
          </p>
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
