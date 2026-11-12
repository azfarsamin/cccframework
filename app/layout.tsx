
import "./globals.css";
import type { Metadata } from "next";
import SiteShell from "./site-shell";

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
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
