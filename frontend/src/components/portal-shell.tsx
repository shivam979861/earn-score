"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { nav, roleLabels } from "@/lib/navigation";
import type { Role, User } from "@/lib/types";

export function PortalShell({ role, user, children }: { role: Role; user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const current = nav[role].find(item => item.href === pathname || (item.href !== `/${role}` && pathname.startsWith(item.href + "/")));

  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [mobileOpen]);

  async function logout() {
    setBusy(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); }
    finally { router.replace("/login"); router.refresh(); }
  }

  return <div className="portal">
    {mobileOpen && <button className="mobile-overlay" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`} aria-label="Workspace sidebar">
      <div className="sidebar-top"><Brand inverse /><button type="button" className="sidebar-mobile-close" aria-label="Close menu" onClick={() => setMobileOpen(false)}><Icon name="x" size={20}/></button></div>
      <div className="workspace-label"><span className="workspace-dot"/>{roleLabels[role]}</div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {nav[role].map(item => {
          const active = pathname === item.href || (item.href !== `/${role}` && pathname.startsWith(item.href + "/"));
          return <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`nav-link ${active ? "nav-active" : ""}`} onClick={() => setMobileOpen(false)}><Icon name={item.icon} size={19}/><span>{item.label}</span></Link>;
        })}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Icon name="info" size={17}/><span>Hackathon prototype<small>Scoring is simulated</small></span></div>
        <button onClick={logout} disabled={busy} className="logout-button"><Icon name="log-out" size={17}/>{busy ? "Signing out…" : "Sign out"}</button>
      </div>
    </aside>
    <div className="portal-main">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="portal-header">
        <div className="header-left"><button type="button" className="mobile-menu" aria-label="Open menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Icon name="menu" size={22}/></button><span className="header-location">{current?.label || roleLabels[role]}</span></div>
        <div className="header-right"><span className="env-badge">PROTOTYPE</span><span className="avatar" aria-hidden="true">{user.full_name.slice(0,1).toUpperCase()}</span><span className="header-user">{user.full_name}</span></div>
      </header>
      <main className="page-content page-enter" key={pathname} id="main-content">{children}</main>
    </div>
  </div>;
}
