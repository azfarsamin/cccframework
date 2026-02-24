import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import Header from "./header";

export const metadata: Metadata = {
  title: "CCC Framework",
  description:
    "Systems thinking, first-principles modeling, and gap analysis using the CCC Framework (Coherence, Correspondence, Calibration).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main className="container main">{children}</main>

       <footer className="footer">
  <div className="container footerInner">
    <div className="muted">© {new Date().getFullYear()} CCC Framework</div>
  </div>
</footer>
      </body>
    </html>
  );
}
