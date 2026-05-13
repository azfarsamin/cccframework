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
                Link
              </a>
            </div>

          </div>
        </div>

        <div className="bookCard">
          <div className="bookMeta">

            <div className="bookTitle">
              Reassessing Prophetic Literacy and the Written Transmission of Revelation: A Linguistic and Textual Analysis of the Qurʾān
            </div>

            <div className="muted">
              SSRN
            </div>

            <div className="bookActions">
              <a
                className="button primary"
                href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6748782"
                target="_blank"
                rel="noreferrer"
              >
                Link
              </a>
            </div>

          </div>
        </div>

      </div>
    </>
  );
}
