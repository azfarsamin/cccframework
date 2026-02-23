"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/", label: "Home" },
  { href: "/ccc", label: "CCC Framework" },
  { href: "/work", label: "Work" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // close menu when route changes
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="header">
      <div className="container headerInner">
        <Link className="brand" href="/">
          CCC Framework
        </Link>

        {/* Desktop nav */}
        <nav className="nav desktopNav" aria-label="Primary">
          {nav.map((item) => (
            <Link key={item.href} className="navLink" href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="hamburger mobileOnly"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span className="hamburgerBar" />
          <span className="hamburgerBar" />
          <span className="hamburgerBar" />
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="mobileMenu">
          <div className="container mobileMenuInner">
            {nav.map((item) => (
              <Link key={item.href} className="mobileLink" href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
