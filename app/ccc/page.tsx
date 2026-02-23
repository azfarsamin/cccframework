import Link from "next/link";

export default function CCCPage() {
  return (
    <>
      <div className="kicker">Method • framework • diagnostic tool</div>
      <h1>The CCC Framework</h1>
      <p>
        CCC is a structured method for analyzing ideas, strategies, and systems across three dimensions:
        coherence, correspondence, and calibration.
      </p>

      <div className="grid three">
        <div className="card">
          <h2>Coherence</h2>
          <p className="muted">Internal validity</p>
          <ul className="list">
            <li>Definitions and assumptions</li>
            <li>Logical consistency</li>
            <li>Boundary conditions</li>
          </ul>
        </div>
        <div className="card">
          <h2>Correspondence</h2>
          <p className="muted">External fit</p>
          <ul className="list">
            <li>Observed outcomes</li>
            <li>Behavior under stress</li>
            <li>Incentive and feedback effects</li>
          </ul>
        </div>
        <div className="card">
          <h2>Calibration</h2>
          <p className="muted">Constraint + correction</p>
          <ul className="list">
            <li>Comparing alternatives</li>
            <li>Detecting drift / Goodharting</li>
            <li>Maintaining alignment over time</li>
          </ul>
        </div>
      </div>

      <div className="hr" />

      <div className="card">
        <h2>What CCC is used for</h2>
        <ul className="list">
          <li>Stress-testing business models and strategies</li>
          <li>Diagnosing persistent failures and blind spots</li>
          <li>Evaluating complex claims beyond surface plausibility</li>
          <li>Designing decision frameworks under uncertainty</li>
        </ul>
        <div className="ctaRow">
          <Link className="button primary" href="/services">Services</Link>
          <Link className="button" href="/contact">Contact</Link>
        </div>
      </div>
    </>
  );
}
