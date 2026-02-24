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
          <p>
            The core lesson in Plato’s Allegory of the Cave is that most people mistake appearances for
            reality. When one prisoner is freed and forced to face the source of the shadows, his
            awakening is painful and disoriented.
          </p>

          <p>
            <strong>Truth hurts.</strong>
          </p>
          <p>
            <strong>It confuses.</strong>
          </p>
          <p>
            <strong>It contradicts everything he once believed.</strong>
          </p>

          <p>
            <em>The Architecture of Debt-Money and Interest</em> takes the reader through a similar
            journey of awakening—lifting the curtain on modern monetary mechanics to reveal what money
            truly is and how interest is embedded into its very structure. Using clear, accessible
            language, the book explains how central and private banks create money, how debt expands
            the money supply, and how this compounding architecture quietly transfers wealth upward
            and distorts society.
          </p>

          <p>
            It then examines so-called Islamic banking, showing how many “interest-free” financial
            products replicate the same debt-based mechanisms under different terminology. The book
            takes the reader through a rigorous pan-textual analysis to demonstrate why modern
            interpretations do not align with the Qurʾān’s firm position on this controversial subject.
          </p>

          <p>
            Tracing the Judeo-Christian history of charging interest, the book explores how interest
            gradually made its way back into European society and evolved into today’s debt-based
            monetary system. It shows how this system is structurally designed to asymmetrically
            privilege the banking industry, and why a compounding interest scheme ultimately funnels
            toward inflation or deflation—both producing devastating socio-economic outcomes
            downstream.
          </p>

          <p>
            The book concludes by turning to the Qurʾān not as theology, but as an epistemic
            framework—testing its own claim that it prohibits interest through internal coherence,
            real-world correspondence, and its ability to correct systemic drift when societies
            deviate from sound principles.
          </p>

          <p>
            The deeper implication is this: while humans naturally mistake consensus for truth and
            resist uncomfortable reality, only a coherent and calibrated economic framework can
            minimize harm, restore justice, and foster genuine prosperity without systemic exploitation.
          </p>

          <div className="bookActions">
            <a className="button primary" href="https://www.amazon.ca/Architecture-Debt-Money-Interest-Qur%CA%BE%C4%81nic-Diagnosis-ebook/dp/B0GNPDXCM6/" target="_blank" rel="noreferrer">
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
