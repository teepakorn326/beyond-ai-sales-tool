"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Icon, type IconName } from "./icons";

const NAV: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: "/cases", label: "Cases", icon: "folder", match: (p) => p === "/cases" || (p.startsWith("/cases/") && !p.startsWith("/cases/new")) },
  { href: "/cases/new", label: "New intake", icon: "upload", match: (p) => p.startsWith("/cases/new") },
  { href: "/queue", label: "Review queue", icon: "list", match: (p) => p.startsWith("/queue") },
  { href: "/assistant", label: "Assistant", icon: "spark", match: (p) => p.startsWith("/assistant") },
  { href: "/system", label: "System", icon: "activity", match: (p) => p.startsWith("/system") },
  { href: "/settings", label: "Settings", icon: "gear", match: (p) => p.startsWith("/settings") },
];

/** The document review route collapses the sidebar so the viewer gets the width. */
function isReviewRoute(p: string): boolean {
  return /^\/cases\/[^/]+\/review\//.test(p);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const collapsed = isReviewRoute(pathname);
  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Primary">
        <Link href="/cases" className="brand">
          <span className="mark">
            <Icon name="shield" size={14} />
          </span>
          <span>Doc Checker</span>
        </Link>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`nav${n.match(pathname) ? " active" : ""}`} title={n.label} aria-current={n.match(pathname) ? "page" : undefined}>
            <Icon name={n.icon} size={18} />
            <span>{n.label}</span>
          </Link>
        ))}
        <div className="sidefoot">
          <span className="avatar" aria-hidden="true">
            R
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>Reviewer</div>
            <div className="muted small">Local session</div>
          </div>
        </div>
      </aside>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>{children}</div>
    </div>
  );
}

export interface Crumb {
  label: string;
  href?: string;
}

export function TopBar({ crumbs, actions }: { crumbs: Crumb[]; actions?: ReactNode }) {
  return (
    <header className="topbar">
      <nav className="crumb" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 6 }}>
            {i > 0 && <Icon name="chev" size={12} />}
            {i === crumbs.length - 1 ? <b>{c.label}</b> : c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
          </span>
        ))}
      </nav>
      <form className="search" role="search" action="/cases" method="get">
        <Icon name="search" size={16} />
        <input name="q" placeholder="Search cases" aria-label="Search cases" />
        <kbd>⌘K</kbd>
      </form>
      <div className="spacer" />
      <div className="row">{actions}</div>
      <button type="button" className="icbtn" aria-label="Notifications">
        <Icon name="bell" size={16} />
      </button>
      <span className="avatar" aria-hidden="true">
        R
      </span>
    </header>
  );
}

export function PageHeader({ title, subtitle, actions, display = false }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; display?: boolean }) {
  return (
    <div className="pagehead">
      <div style={{ minWidth: 0 }}>
        <h1 className={`h1${display ? " display" : ""}`}>{title}</h1>
        {subtitle && <div className="sub">{subtitle}</div>}
      </div>
      {actions && <div className="row wrap">{actions}</div>}
    </div>
  );
}
