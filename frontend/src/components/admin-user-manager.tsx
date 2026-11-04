"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import type { User } from "@/lib/types";
import { Icon } from "@/components/icon";

type ProvisionRole = "lender" | "admin";

function errorText(data: {detail?: unknown}): string {
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map(item => item.msg).join("; ");
  return "Unable to complete the request";
}

export function AdminUserManager({ initialUsers, currentId }: { initialUsers: User[]; currentId: string }) {
  const [users, setUsers] = useState(initialUsers);
  const [role, setRole] = useState<ProvisionRole>("lender");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "worker" | "lender" | "admin">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const router = useRouter();
  const filteredUsers = useMemo(() => users.filter(u => (filter === "all" || u.role === filter) && `${u.full_name} ${u.email}`.toLowerCase().includes(query.trim().toLowerCase())), [users, query, filter]);
  const activeCount = users.filter(u => u.is_active).length;

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy("create"); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const fields = Object.fromEntries(new FormData(formElement).entries());
    try {
      const response = await fetch("/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, role }) });
      const data = await response.json();
      if (!response.ok) throw new Error(errorText(data));
      setUsers(prev => [data as User, ...prev]);
      formElement.reset(); setRole("lender"); setMessage("Account provisioned. Share credentials through a secure channel and require a password change.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Provisioning failed"); }
    finally { setBusy(null); }
  }

  async function updateStatus(user: User) {
    if (user.is_active && !window.confirm(`Deactivate ${user.full_name}? Their active sessions will be revoked immediately.`)) return;
    setBusy(user.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${user.id}/status`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !user.is_active }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(errorText(data));
      setUsers(prev => prev.map(item => item.id === user.id ? data as User : item));
      setMessage(`Account ${user.is_active ? "deactivated" : "activated"}.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Update failed"); }
    finally { setBusy(null); }
  }

  return <div className="account-layout">
    <section className="card account-panel">
      <div className="section-kicker">PROVISION ACCOUNT</div>
      <h2>Invite a lender or admin</h2>
      <p className="account-helper">Only authorized admins can create these accounts. Public registration always creates a worker.</p>
      <form onSubmit={createUser} className="account-form">
        <label>Full name<input name="full_name" required minLength={2} maxLength={160} placeholder="Name" autoComplete="off" /></label>
        <label>Work email<input name="email" type="email" required placeholder="lender@example.com" autoComplete="off" /></label>
        <label>Temporary password<input name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" placeholder="At least 10 characters" /></label>
        <label>Role<select value={role} onChange={event => setRole(event.target.value as ProvisionRole)}>
          <option value="lender">Lender — restricted review portal</option>
          <option value="admin">Admin — user administration</option>
        </select></label>
        {role === "admin" && <div className="inline-note"><Icon name="alert-triangle" size={17}/> Admins can create and deactivate accounts. Provision only trusted operators.</div>}
        <button className="btn btn-primary" type="submit" disabled={busy !== null}><Icon name="user-plus" size={17}/>{busy === "create" ? "Creating..." : "Create account"}</button>
      </form>
    </section>
    <section className="card account-panel">
      <div className="section-kicker">ROLE-BASED ACCESS</div>
      <h2>Manage users <span className="user-count">{users.length}</span></h2>
      <p className="account-helper">{activeCount} active of {users.length} total accounts. Deactivation immediately revokes sessions. You cannot deactivate yourself.</p>
      <div className="user-filters"><label className="user-search"><Icon name="search" size={17}/><input aria-label="Search users" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or email..." /></label><label className="filter-label">Role <select aria-label="Filter users by role" value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All roles</option><option value="worker">Workers</option><option value="lender">Lenders</option><option value="admin">Admins</option></select></label></div>
      {error && <div className="form-error" role="alert"><Icon name="circle-alert" size={17}/>{error}</div>}
      {message && <div className="success-note" role="status"><Icon name="check-circle-2" size={17}/>{message}</div>}
      <div className="user-table-scroll"><table className="user-table"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {filteredUsers.map(user => <tr key={user.id} className="table-reveal"><td><strong>{user.full_name}</strong><small>{user.email}</small></td><td><span className="role-pill">{user.role}</span></td><td><span className={user.is_active ? "status-active" : "status-inactive"}>{user.is_active ? "Active" : "Disabled"}</span></td><td><button className="btn btn-outline btn-sm" disabled={busy !== null || user.id === currentId} onClick={() => updateStatus(user)} title={user.id === currentId ? "Cannot deactivate your own admin account" : undefined}>{busy === user.id ? "Updating..." : user.id === currentId ? "You" : user.is_active ? "Deactivate" : "Activate"}</button></td></tr>)}
      </tbody></table></div>
      {filteredUsers.length === 0 && <p className="account-helper">No users match this filter.</p>}
    </section>
  </div>;
}
