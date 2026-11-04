import { AdminUserManager } from "@/components/admin-user-manager";
import { getAdminUsers, requireRole } from "@/lib/server-auth";
export default async function Page() {
  const admin = await requireRole("admin");
  const users = await getAdminUsers();
  return <><div className="page-heading"><div><div className="eyebrow">ACCESS GOVERNANCE</div><h1>Users & roles</h1><p>Provision trusted accounts and control access to the worker, lender, and admin workspaces.</p></div><span className="phase-badge">LIVE MODULE</span></div><AdminUserManager initialUsers={users} currentId={admin.id}/></>;
}
