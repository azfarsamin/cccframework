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
                    href="https://www.amazon.ca/Architecture-Debt-Money-Interest-Qur%CA%BE%C4%81nic-Diagnosis-ebook/dp/B0GNPDXCM6/"
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
                  <a className="button primary" href="https://www.amazon.ca/dp/B0GHV3LGRH" target="_blank" rel="noreferrer">
                    Amazon
                  </a>
                </div>
              </div>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 12 }}>
            (We’ll add cover images, endorsements, and sample excerpts when you’re ready.)
          </p>
        </div>

        <div className="card">
          <h2>Articles</h2>
          <p className="muted">
            Short-form analysis applying the CCC lens to current debates and recurring failure modes.
          </p>

          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 13 }}>
              2026-02-24
            </div>

            <div style={{ marginTop: 6, fontWeight: 600 }}>
              <Link href="/articles/outsourced-thinking-or-misplaced-anxiety">
                Outsourced Thinking or Misplaced Anxiety? Why the Real Threat Isn’t AI — It’s Epistemic Surrender
              </Link>
            </div>

            <p className="muted" style={{ marginTop: 8 }}>
              Civilization is built on outsourcing lower-level burdens so higher-order thought can flourish. The risk
              isn’t AI—it’s epistemic surrender.
            </p>

            <div className="bookActions" style={{ marginTop: 12 }}>
              <Link className="button primary" href="/articles/outsourced-thinking-or-misplaced-anxiety">
                Read
              </Link>
              <Link className="button" href="/articles">
                View all
              </Link>
            </div>
          </div>
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
