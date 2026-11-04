"use client";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import type { User } from "@/lib/types";
import { Icon } from "@/components/icon";

export function AccountSecurity({ user }: { user: User }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (body.new_password !== body.confirm_password) { setError("New passwords do not match"); setBusy(false); return; }
    try {
      const res = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({current_password: body.current_password, new_password: body.new_password}) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unable to change password");
      router.replace("/login?password=changed"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change password"); }
    finally { setBusy(false); }
  }
  return <div className="account-layout"><section className="card account-panel">
    <div className="section-kicker">SIGNED-IN ACCOUNT</div><h2>{user.full_name}</h2><p className="account-helper">{user.email} · {user.role} role</p>
    <div className="role-boundary"><Icon name="shield-check" size={19}/><span>Access is checked against your current server-side role on every protected request.</span></div>
  </section><section className="card account-panel"><div className="section-kicker">CREDENTIAL SECURITY</div><h2>Change your password</h2><p className="account-helper">Changing your password revokes all sessions. You will need to sign in again.</p><form className="account-form" onSubmit={onSubmit}>
    <label>Current password<input name="current_password" type="password" autoComplete="current-password" required /></label>
    <label>New password<input name="new_password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    <label>Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required /></label>
    {error && <div className="form-error" role="alert"><Icon name="circle-alert" size={17}/>{error}</div>}
    <button type="submit" className="btn btn-primary" disabled={busy}><Icon name="lock-keyhole" size={17}/>{busy ? "Updating..." : "Update password"}</button>
  </form></section></div>;
}
