import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Overview, Role, User } from "@/lib/types";

const panels = {
  worker: {
    intro: "Start with your income story.",
    description: "Explore how irregular earnings could be assessed. Your finances have not been uploaded or scored.",
    primary: { title: "Preview an income statement", detail: "See what the system can read from a CSV, safely in your browser.", href: "/worker/uploads", icon: "cloud-upload", tag: "Available · local preview" },
    secondary: { title: "Explore a sample EarnScore", detail: "Adjust fictional earnings and view the score explanation.", href: "/worker/assessment", icon: "gauge", tag: "Interactive example" },
    tertiary: { title: "Manage privacy preferences", detail: "Control consent records. Sharing still requires a separate lender grant.", href: "/worker/consent", icon: "shield-check", tag: "Connected to backend" },
  },
  lender: {
    intro: "Review evidence, not just a number.",
    description: "The lender review workflow is a guided fictional case. Live applicant cases have not been enabled.",
    primary: { title: "Practice a sample review", detail: "Check fictional income, evidence gaps, and record a local decision.", href: "/lender/demo", icon: "clipboard-check", tag: "Interactive example" },
    secondary: { title: "Applicant cases", detail: "Will show only borrower-authorized financial assessments.", href: "/lender/applications", icon: "users", tag: "Coming next" },
    tertiary: { title: "Account security", detail: "Update the password for your lender account.", href: "/lender/settings", icon: "lock-keyhole", tag: "Connected to backend" },
  },
  admin: {
    intro: "Manage access with confidence.",
    description: "Provision accounts and manage roles without opening workers' private financial data.",
    primary: { title: "Manage users and roles", detail: "Create lender accounts and manage activation status.", href: "/admin/users", icon: "users-round", tag: "Connected to backend" },
    secondary: { title: "Audit explorer", detail: "A searchable audit log viewer is planned for a later phase.", href: "/admin/audit", icon: "scroll-text", tag: "Coming next" },
    tertiary: { title: "Account security", detail: "Update the password for your admin account.", href: "/admin/settings", icon: "lock-keyhole", tag: "Connected to backend" },
  },
} as const;

export function OverviewPage({ user, role, overview }: { user: User; role: Role; overview: Overview | null }) {
  const data = panels[role];
  const items = [data.primary, data.secondary, data.tertiary];
  const ready = items.filter(item => !item.tag.startsWith("Coming"));
  return <div className="new-overview">
    <div className="workspace-intro"><div><span className="ui-kicker">{role === "worker" ? "MY WORKSPACE" : role === "lender" ? "LENDER WORKSPACE" : "ADMIN WORKSPACE"}</span><h1>Hi, {user.full_name.trim().split(/\s+/)[0]} <span aria-hidden="true">👋</span></h1><p>{data.intro}</p></div><span className="ui-status">Prototype environment</span></div>
    {overview === null && <div className="offline-warning" role="status"><Icon name="circle-alert" size={18}/>Unable to load account summary. Make sure the backend is running.</div>}
    <section className="welcome-banner"><div><div className="welcome-pill"><Icon name="shield-check" size={15}/> Transparent by design</div><h2>{data.description}</h2><p>Real credit decisions require verified data and a human lender review.</p></div><Icon name="chart-no-axes-combined" size={88} className="welcome-symbol"/></section>
    <div className="home-section-title"><div><span className="ui-kicker">GET STARTED</span><h2>What would you like to do?</h2></div><span>{ready.length} tools ready to explore</span></div>
    <div className="task-grid">
      {items.map((item,i) => <Link className={`task-card ${i===0?"task-featured":""}`} href={item.href} key={item.href}>
        <span className="task-icon"><Icon name={item.icon} size={23}/></span><span className="task-tag">{item.tag}</span><h3>{item.title}</h3><p>{item.detail}</p><span className="task-action">{item.tag.startsWith("Coming") ? "View planned feature" : "Open tool"} <Icon name="arrow-right" size={17}/></span>
      </Link>)}
    </div>
    <section className="roadmap-note"><Icon name="info" size={19}/><div><strong>What is live right now?</strong><p>Authentication, account management, and consent records use the backend. Income processing and lender decisions are not yet connected; sample assessments use fictional data only.</p></div></section>
  </div>;
}
