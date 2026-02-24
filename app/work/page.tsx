import Image from "next/image";
import Link from "next/link";

export default function DebtMoneyPage() {
  return (
    <>
      <div className="kicker">Book</div>

      <div className="bookHero">
        <div className="bookCover">
          <Image
            src="/books/debt-money.jpg"
            alt="The Architecture of Debt-Money and Interest book cover"
            width={420}
            height={630}
            priority
          />
        </div>

        <div className="bookHeroText">
          <h1 className="bookHeroTitle">
            The Architecture of Debt-Money and Interest: A Qurʾānic Diagnosis
          </h1>

          <p className="muted">
            A first-principles diagnosis of modern money creation, compounding debt, and systemic exploitation — tested through coherence, correspondence, and calibration.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="bookContent">
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
                  <a className="button primary" href="#" target="_blank" rel="noreferrer">
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
                  <a className="button primary" href="#" target="_blank" rel="noreferrer">
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
