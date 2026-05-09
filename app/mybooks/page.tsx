import Image from "next/image";
import Link from "next/link";

export default function WorkPage() {
  return (
    <>
      <div className="kicker">Books • publications</div>

      <h1>Work</h1>

      <p className="muted">
        Selected books applying the CCC Framework to economics, epistemology, and systems thinking.
      </p>

      <div className="card">
        <h2>Books</h2>

        <div className="bookStack">
          <div className="bookCard">
            <div className="bookItem">
              <div className="bookThumb">
                <Image
                  src="/books/debt-money.jpg"
                  alt="The Architecture of Debt-Money and Interest book cover"
                  width={110}
                  height={165}
                />
              </div>

              <div className="bookMeta">
                <div className="bookTitle">
                  The Architecture of Debt-Money and Interest
                </div>

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
          </div>

          <div className="bookCard">
            <div className="bookItem">
              <div className="bookThumb">
                <Image
                  src="/books/reason-revelation.jpg"
                  alt="Reason, Revelation, and the Architecture of Truth book cover"
                  width={110}
                  height={165}
                />
              </div>

              <div className="bookMeta">
                <div className="bookTitle">
                  Reason, Revelation, and the Architecture of Truth
                </div>

                <div className="muted">
                  CCC foundations: coherence, correspondence, and calibration as a method for testing truth claims.
                </div>

                <div className="bookActions">
                  <Link
                    className="button"
                    href="/work/reason-revelation-architecture-truth"
                  >
                    Details
                  </Link>

                  <a
                    className="button primary"
                    href="https://www.amazon.ca/dp/106746221X"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Amazon
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
