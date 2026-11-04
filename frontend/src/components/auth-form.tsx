"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icon";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [password, setPassword] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    try {
      const res = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Unable to sign in");
      router.replace(`/${data.role || "worker"}`);
      router.refresh();
    } catch (err) { setError(err instanceof Error ? err.message : "Something went wrong"); }
    finally { setBusy(false); }
  }
  return <form className="auth-form" onSubmit={submit}>
    {mode === "register" && <label>Full name<input name="full_name" placeholder="Your full name" minLength={2} maxLength={160} required autoComplete="name"/></label>}
    <label>Email address<input name="email" type="email" placeholder="you@example.com" autoComplete="email" required/></label>
    <label>Password<div className="password-control"><input name="password" value={password} onChange={e=>setPassword(e.target.value)} type={showPassword ? "text" : "password"} minLength={mode === "register" ? 10 : undefined} placeholder={mode === "register" ? "At least 10 characters" : "Enter your password"} autoComplete={mode === "register" ? "new-password" : "current-password"} required/><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={()=>setShowPassword(v=>!v)}><Icon name={showPassword ? "eye-off" : "eye"} size={18}/></button></div></label>
    {mode === "register" && <div className="password-hint"><span>Password length</span><span className={password.length >= 10 ? "good" : ""}>{password.length >= 10 ? "Minimum met" : `${Math.max(0,10-password.length)} more characters needed`}</span></div>}
    {error && <div className="form-error reveal" role="alert"><Icon name="circle-alert" size={17}/>{error}</div>}
    <button type="submit" className="btn btn-primary btn-full" disabled={busy} aria-busy={busy}>{busy ? "Please wait..." : mode === "register" ? "Create worker account" : "Sign in to EarnScore"}<Icon name="arrow-right" size={18}/></button>
    <p className="auth-switch">{mode === "login" ? "New to EarnScore?" : "Already have an account?"} <Link href={mode === "login" ? "/register" : "/login"}>{mode === "login" ? "Create an account" : "Sign in"}</Link></p>
    {mode === "register" && <p className="auth-fineprint">Worker registration only. Lender and admin accounts are provisioned by an administrator or via the trusted CLI. Do not upload real financial data to this starter.</p>}
  </form>;
}
