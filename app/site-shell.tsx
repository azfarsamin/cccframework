
"use client";

import { usePathname } from "next/navigation";
import Header from "./header";

export default function SiteShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isQuran = pathname === "/quran" || pathname.startsWith("/quran/");

  if (isQuran) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <main className="container main">{children}</main>
      <footer className="footer">
        <div className="container footerInner">
          <div className="muted">
            © {new Date().getFullYear()} CCC Framework
          </div>
        </div>
      </footer>
    </>
  );
}
