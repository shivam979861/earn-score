import { AccountSecurity } from "@/components/account-security";
import { requireRole } from "@/lib/server-auth";
export default async function Page() {
  const user = await requireRole("admin");
  return <><div className="page-heading"><div><div className="eyebrow">ACCOUNT MANAGEMENT</div><h1>Account security</h1><p>Manage your password and review the permissions attached to your account.</p></div><span className="phase-badge">LIVE MODULE</span></div><AccountSecurity user={user}/></>;
}
