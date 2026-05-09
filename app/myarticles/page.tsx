import Link from "next/link";

export default function ArticlesPage() {
  return (
    <>
      <div className="kicker">First-principles • Systems thinking • Architecture</div>
      <h1>Articles</h1>
      <p className="muted">
        Practical analysis using structured reasoning from first principles, looking at truth as a whole rather than isolated parts.
      </p>

      <div className="grid two">
        <div className="card">
          <h2>Outsourced Thinking or Misplaced Anxiety?</h2>
          <p>
            A CCC-based analysis arguing that the real risk of AI is not automation of thinking,
            but epistemic surrender—abandoning judgment, verification, and calibration.
          </p>

          <div className="bookActions">
            <Link
              className="button primary"
              href="/articles/outsourced-thinking-or-misplaced-anxiety"
            >
              Read Article
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
