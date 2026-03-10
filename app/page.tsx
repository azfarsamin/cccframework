import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <div className="kicker">Systems thinking • first principles • gap analysis</div>
      <h1>Systems Thinking for Complex Problems</h1>
      <p className="muted">
        I help analyze complex systems from first principles to uncover hidden assumptions,
        structural gaps, and leverage points for better decisions.
      </p>

      <div className="ctaRow">
        <Link className="button primary" href="/contact">Start a conversation</Link>
        <Link className="button" href="/services">View services</Link>
        <Link className="button" href="/ccc">What is CCC?</Link>
      </div>

      <div className="hr" />

      <div className="grid two">
        <div className="card">
          <h2>What I do</h2>
          <ul className="list">
            <li>Model systems and arguments from first principles</li>
            <li>Identify contradictions, drift, and incentive failures</li>
            <li>Turn messy problem spaces into clear decision frameworks</li>
            <li>Deliver concise, actionable outputs (not fluff)</li>
          </ul>
        </div>

        <div className="card">
          <h2>Who this is for</h2>
          <ul className="list">
            <li>Founders and operators dealing with complexity and uncertainty</li>
            <li>Researchers and writers building frameworks or long-form work</li>
            <li>Teams evaluating AI systems, metrics, or decision processes</li>
            <li>Organizations needing a structural “second brain” to stress-test assumptions</li>
          </ul>
        </div>
      </div>

      <div className="hr" />
      <div className="hr" />

      <div className="card">
        <div className="kicker">Research / Talks</div>
        <h2>AERC 2026</h2>
        <p>
          <strong>Coherence, Correspondence, Calibration: A Meta-Epistemology Applied to Austrian Economics</strong>
        </p>
        <p className="muted">
          Conference presentation at the Austrian Economics Research Conference applying the CCC Framework to Austrian methodology, catallaxy, and decentralized intelligence systems.
        </p>

        <div className="bookActions">
          <Link className="button" href="/work/aerc-2026">
            View Presentation Page
          </Link>

          <a
            className="button primary"
            href="/pdfs/aerc-2026-slides.pdf"
            target="_blank"
            rel="noreferrer"
          >
            View Slides (PDF)
          </a>
        </div>
      </div>
      <div className="grid three">
        <div className="card">
          <div className="kicker">Coherence</div>
          <h2>Internal structure</h2>
          <p>
            Does the model hold together without contradiction? Are the definitions stable and the logic sound?
          </p>
        </div>
        <div className="card">
          <div className="kicker">Correspondence</div>
          <h2>Reality fit</h2>
          <p>
            Does it match observed behavior and outcomes? Where does lived reality expose failure modes?
          </p>
        </div>
        <div className="card">
          <div className="kicker">Calibration</div>
          <h2>Correction loop</h2>
          <p>
            What forces continuous correction? How do we prevent metric gaming, drift, and false certainty?
          </p>
        </div>
      </div>
    </>
  );
}
