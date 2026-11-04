import type { Role } from "@/lib/types";

export type NavItem = { label: string; href: string; icon: string; description?: string };

// Primary navigation deliberately lists useful, reachable experiences only.
// Existing future-phase routes are retained for development and bookmarked links.
export const nav: Record<Role, NavItem[]> = {
  worker: [
    { label: "Home", href: "/worker", icon: "layout-dashboard" },
    { label: "Preview a statement", href: "/worker/uploads", icon: "cloud-upload" },
    { label: "Try EarnScore", href: "/worker/assessment", icon: "gauge" },
    { label: "Privacy & consent", href: "/worker/consent", icon: "shield-check" },
    { label: "Account", href: "/worker/settings", icon: "lock-keyhole" },
  ],
  lender: [
    { label: "Home", href: "/lender", icon: "layout-dashboard" },
    { label: "Practice a review", href: "/lender/demo", icon: "clipboard-check" },
    { label: "Account", href: "/lender/settings", icon: "lock-keyhole" },
  ],
  admin: [
    { label: "Home", href: "/admin", icon: "layout-dashboard" },
    { label: "Users & roles", href: "/admin/users", icon: "users-round" },
    { label: "Account", href: "/admin/settings", icon: "lock-keyhole" },
  ],
};

export const roleLabels: Record<Role,string> = { worker: "Worker workspace", lender: "Lender workspace", admin: "Admin workspace" };

export const modules: Record<string, { eyebrow: string; title: string; description: string; phase: string; steps: string[] }> = {
  "/worker/profile": { eyebrow: "Planned feature", title: "Worker profile", description: "Work history and income-source profiles are not available yet.", phase: "Not available yet", steps: ["Add occupation and work details", "Record income sources", "Check completeness"] },
  "/worker/transactions": { eyebrow: "Planned feature", title: "Saved transactions", description: "Transaction storage and reconciliation are not connected yet. You can inspect a CSV on the preview page without uploading it to a server.", phase: "Not available yet", steps: ["Persist verified source records", "Deduplicate transactions", "Support user corrections"] },
  "/worker/reports": { eyebrow: "Planned feature", title: "My reports", description: "Real assessment reports require a working ingestion and scoring service.", phase: "Not available yet", steps: ["Generate a versioned report", "Add lender-specific sharing", "Support revocation"] },
  "/lender/applications": { eyebrow: "Planned feature", title: "Applications", description: "No live applications are available. Start with the fictional lender review to explore the proposed workflow.", phase: "Not available yet", steps: ["Accept applicant-authorized cases", "Display real evidence", "Require active grants"] },
  "/lender/reviews": { eyebrow: "Planned feature", title: "Review queue", description: "The live review queue is not connected. A fictional review flow is available for demonstration.", phase: "Not available yet", steps: ["Request evidence", "Track reviewers", "Record human decisions"] },
  "/lender/reports": { eyebrow: "Planned feature", title: "Assessment reports", description: "Report generation will be connected after ingestion and scoring are implemented.", phase: "Not available yet", steps: ["Review versioned evidence", "Check consent and access", "Export reports"] },
  "/admin/models": { eyebrow: "Planned feature", title: "Scoring governance", description: "Production scoring models and validation data are not available yet.", phase: "Not available yet", steps: ["Version scoring formulas", "Run fairness tests", "Record evaluation results"] },
  "/admin/audit": { eyebrow: "Planned feature", title: "Audit explorer", description: "An administrator-facing audit explorer has not been implemented.", phase: "Not available yet", steps: ["Query access events", "Review consent history", "Export an audit trail"] },
};
