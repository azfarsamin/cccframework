import Link from "next/link";

export default function TruthArchitecturePage() {
  return (
    <>
      <div className="kicker">Book</div>

      <h1 className="bookHeroTitle">
        Reason, Revelation, and the Architecture of Truth: A Framework for Evaluating Worldviews
      </h1>

      <div className="card">
        <div className="bookContent">
          <p>
            When people debate worldviews, they usually do so with incomplete or ambiguous information,
            or unexamined inherited assumptions. But if truth claims are genuinely competing, how can
            they be evaluated without privileging one system in advance?
          </p>

          <p>
            This book proposes a different approach. It introduces a framework for assessing worldviews
            by testing their coherence, their correspondence with reality, and their ability to remain
            stable under an external calibration standard—something outside the belief system itself by
            which claims can be measured and compared. Rather than beginning with belief and defending
            it, the method compares explanations by asking which one best survives constraint across
            reason, experience, and moral consequence.
          </p>

          <p>
            Most religious works say, <em>“Here is the truth—now let me justify it.”</em>
            <br />
            Most secular works say, <em>“Here is the method—revelation is excluded by definition.”</em>
            <br />
            This book says, <em>“Nothing is exempt or assumed. Let’s see what holds.”</em>
          </p>

          <p>
            Using the Qurʾān as a test case—rather than an assumed authority—the framework evaluates
            revelatory and non-revelatory worldviews alike without appeal to authority or faith-based
            exemption—treating truth as something to be tested and compared, not assumed in advance.
          </p>

          <div className="bookActions">
            <a className="button primary" href="#" target="_blank" rel="noreferrer">
              Buy on Amazon
            </a>

            <Link className="button" href="/contact">
              Contact (bulk / speaking / consulting)
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
