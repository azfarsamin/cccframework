import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Publications | CCC Framework",
  description:
    "Formal publications and SSRN papers applying the CCC Framework.",
};

export default function PublicationsPage() {
  return (
    <>
      <div className="kicker">SSRN • research papers • publications</div>

      <h1>Publications</h1>

      <p className="muted">
        Formal publications and working papers.
      </p>

      <div className="bookStack">

        <div className="bookCard">
          <div className="bookMeta">

            <div className="bookTitle">
              Coherence, Correspondence, Calibration: A Meta-Epistemology Applied to Austrian Economics
            </div>

            <div className="muted">
              Austrian Economics Research Conference (AERC) 2026
            </div>

            <div className="bookActions">
              <a
                className="button primary"
                href="#"
                target="_blank"
                rel="noreferrer"
              >
                SSRN
              </a>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
