import Image from "next/image";
import Link from "next/link";

export default function AERC2026Page() {
  return (
    <>
      <div className="kicker">Conference Presentation</div>

      <div className="bookHero">
        <div className="bookCover">
          <Image
            src="/images/aerc-2026-cover.png"
            alt="AERC 2026 presentation cover"
            width={420}
            height={630}
            priority
          />
        </div>

        <div className="bookHeroText">
          <h1 className="bookHeroTitle">
            Coherence, Correspondence, Calibration: A Meta-Epistemology Applied to Austrian Economics
          </h1>

          <p className="muted">
            Austrian Economics Research Conference (AERC) 2026
          </p>
        </div>
      </div>

      <div className="card">
        <div className="bookContent">
          <p>
            Austrian Economics (AE) has long emphasized dispersed knowledge, subjective valuation,
            and spontaneous order. Yet its core methodological tool—praxeology—remains a
            coherence-dominant, deductive framework with limited mechanisms for empirical testing
            or adaptive revision. As a result, Hayek’s concept of catallaxy has remained largely
            theoretical: a compelling account of decentralized coordination without the epistemic
            machinery needed to operate in high-complexity environments.
          </p>

          <p>
            This paper develops the Coherence–Correspondence–Calibration (CCC) Framework as a
            reasoning-based, meta-epistemological model for clarifying the justificatory structure
            of AE. This work argues that stable adaptive systems require three things: coherence,
            correspondence, and an explicit calibration axis. Mises grounds the system in
            praxeology, which provides strong deductive coherence, and markets supply partial
            inductive correspondence through decentralized feedback, yet these empirical signals do
            not play a formal recalibrating role. Catallaxy thus remains conceptually rich but
            methodologically under-specified.
          </p>

          <p>
            The CCC framework shows how an abductive calibration axis—common to scientific
            inference and contemporary learning architectures—can integrate deductive structure
            with empirical responsiveness without departing from Austrian methodological
            commitments. This lens helps explain why praxeology, while internally rigorous,
            functions as a non-generative epistemology.
          </p>

          <p>
            CCC does not replace Austrian methodology but complements it by clarifying the
            conditions under which coherence, correspondence, and calibration jointly support
            stable economic inference. It thereby provides a structured way to reinterpret
            catallaxy as an epistemic process and to identify the minimal reasoning architecture
            required for its realization. The paper concludes by arguing that future decentralized
            intelligence systems—including distributed AI markets—will increasingly depend on such
            tri-modal epistemic architectures.
          </p>

          <div className="bookActions">
            <a
              className="button primary"
              href="/pdfs/aerc-2026-slides.pdf"
              target="_blank"
              rel="noreferrer"
            >
              View Slides (PDF)
            </a>

            <a
              className="button"
              href="/pdfs/aerc-2026-paper.pdf"
              target="_blank"
              rel="noreferrer"
            >
              Paper (coming soon)
            </a>
          </div>

          <p className="muted" style={{ marginTop: 14 }}>
            If you're interested in the framework or slides, they are available here and will be
            updated as the project develops.
          </p>

          <div className="bookActions" style={{ marginTop: 10 }}>
            <Link className="button" href="/contact">
              Contact
            </Link>
            <Link className="button" href="/work">
              Back to Work
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
