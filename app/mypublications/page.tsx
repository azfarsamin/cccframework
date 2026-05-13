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
              The Qur'an, Hadith, and the Debate on Marriageable Age: A Textual Analysis
            </div>

            <div className="muted">
              AL AASAR JOURNAL
            </div>

            <div className="bookActions">
              <a
                className="button primary"
                href="https://al-aasar.com/index.php/Journal/article/view/816"
                target="_blank"
                rel="noreferrer"
              >
                AL-AASAR Journal Link
              </a>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
