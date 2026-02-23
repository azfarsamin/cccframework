import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CCC Framework",
  description:
    "Systems thinking, first-principles modeling, and gap analysis using the CCC Framework (Coherence, Correspondence, Calibration).",
};

const nav = [
  { href: "/", label: "Home" },
  { href: "/ccc", label: "CCC Framework" },
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="container headerInner">
            <Link className="brand" href="/">
              CCC Framework
            </Link>

            <nav className="nav" aria-label="Primary">
              {nav.map((item) => (
                <Link key={item.href} className="navLink" href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        <main className="container main">{children}</main>

        <footer className="footer">
          <div className="container footerInner">
            <div className="muted">© {new Date().getFullYear()} CCC Framework</div>
            <div className="muted">
              <a className="link" href="mailto:david@cccframework.ca">
                david@cccframework.ca
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
