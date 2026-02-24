import Link from "next/link";

export default function ArticlesPage() {
  return (
    <>
      <div className="kicker">Articles • analysis • applied thinking</div>
      <h1>Articles</h1>
      <p className="muted">
        Short-form work applying the CCC lens to current questions.
      </p>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>
            <Link className="link" href="/articles/outsourced-thinking-or-misplaced-anxiety">
              Outsourced Thinking or Misplaced Anxiety? Why the Real Threat Isn’t AI — It’s Epistemic Surrender
            </Link>
          </h2>

          <p className="muted" style={{ marginBottom: 10 }}>
            2026-02-24 • AI • epistemology • calibration
          </p>

          <p>
            A CCC-based diagnosis of AI fears: the real risk isn’t automation of tasks, but epistemic surrender—abandoning
            judgment, verification, and calibration.
          </p>

          <div className="ctaRow">
            <Link className="button primary" href="/articles/outsourced-thinking-or-misplaced-anxiety">
              Read
            </Link>
            <Link className="button" href="/work/reason-revelation-architecture-truth">
              CCC book: Details
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
