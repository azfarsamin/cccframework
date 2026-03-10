import Link from "next/link";

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

          <div className="bookStack">
            <div className="bookCard">
              <div className="bookMeta">
                <div className="bookTitle">The Architecture of Debt-Money and Interest</div>
                <div className="muted">
                  A first-principles breakdown of modern money creation, compounding debt, and systemic drift.
                </div>
                <div className="bookActions">
                  <Link className="button" href="/work/debt-money-interest">
                    Details
                  </Link>
                  <a
                    className="button primary"
                    href="https://www.amazon.ca/dp/1067462201"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Amazon
                  </a>
                </div>
              </div>
            </div>

            <div className="bookCard">
              <div className="bookMeta">
                <div className="bookTitle">Reason, Revelation, and the Architecture of Truth</div>
                <div className="muted">
                  CCC foundations: coherence, correspondence, and calibration as a method for testing truth claims.
                </div>
                <div className="bookActions">
                  <Link className="button" href="/work/reason-revelation-architecture-truth">
                    Details
                  </Link>
                  <a className="button primary" href="https://www.amazon.ca/dp/106746221X" target="_blank" rel="noreferrer">
                    Amazon
                  </a>
                </div>
              </div>
            </div>
          </div>
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
        <h2>AERC 2026</h2>
        <p className="muted">
          Conference presentation applying the CCC Framework as a meta-epistemology to Austrian Economics.
        </p>

        <div className="bookActions">
          <Link className="button" href="/work/aerc-2026">
            View page
          </Link>

          <a
            className="button primary"
            href="/pdfs/aerc-2026-slides.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Slides (PDF)
          </a>
        </div>
      </div>

      <div className="hr" />

      <div className="card">
        <h2>On-going Work</h2>
        <ul className="list">
<li>CCC Framework applied to Austrian Economics</li>
<li>AI-based calibrated thinking and reasoning</li>
<li>Humean IS-OUGHT problem applied to modern thinking</li>
        </ul>
      </div>
    </>
  );
}
