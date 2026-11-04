"use client";

import { useCallback, useEffect, useState } from "react";
import { Icon } from "@/components/icon";

type Permission = "assessment" | "report" | "decision";
type Consent = {
  id: string;
  scopes: Record<Permission, boolean> | Partial<Record<Permission, boolean>>;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  active: boolean;
};
const AVAILABLE: { id: Permission; name: string; description: string }[] = [
  { id: "assessment", name: "Assessment summary", description: "Score, status and the main assessment findings" },
  { id: "report", name: "Lender report", description: "Versioned report metadata and report access" },
  { id: "decision", name: "Lender review action", description: "Permit recorded human-review decisions when implemented" },
];

export function WorkerConsentManager() {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [scopes, setScopes] = useState<Permission[]>(["assessment", "report"]);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/worker/consents", { cache: "no-store" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Unable to load consent records");
      setConsents(data as Consent[]);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load records"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create() {
    if (scopes.length === 0) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch("/api/worker/consents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes, expires_in_days: days }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Could not record consent");
      setNotice("Consent preferences saved. No lender receives access until you explicitly issue a separate assessment grant.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to create consent"); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    if (!window.confirm("Revoke this consent? Linked lender grants will stop working immediately.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const r = await fetch(`/api/worker/consents/${encodeURIComponent(id)}/revoke`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Unable to revoke consent");
      setNotice("Consent revoked. Previously authorized lender access linked to it is no longer valid.");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to revoke consent"); }
    finally { setBusy(false); }
  }

  return <div className="consent-grid">
    <section className="card consent-panel">
      <span className="card-overline">SHARING PREFERENCES</span>
      <h2>Choose what a lender may access</h2>
      <p className="consent-subtext">Your consent does not create a loan application or give any lender immediate access. You must also issue a separate, assessment-specific lender grant.</p>
      <div className="consent-permissions">
        {AVAILABLE.map(item => <label key={item.id} className="consent-permission">
          <input type="checkbox" checked={scopes.includes(item.id)} onChange={e => setScopes(current => e.target.checked ? [...current, item.id] : current.filter(s => s !== item.id))} />
          <span><strong>{item.name}</strong><small>{item.description}</small></span>
        </label>)}
      </div>
      <label className="consent-duration">Consent expiry
        <select value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </label>
      <button className="btn btn-primary" type="button" disabled={busy || scopes.length === 0} onClick={create}>
        <Icon name="shield-check" size={16}/> {busy ? "Saving…" : "Save consent preferences"}
      </button>
      {error && <div className="consent-alert error" role="alert">{error}</div>}
      {notice && <div className="consent-alert ok" role="status">{notice}</div>}
    </section>
    <section className="card consent-panel">
      <span className="card-overline">CONSENT HISTORY</span>
      <h2>Your recorded consents</h2>
      {loading ? <p className="consent-subtext">Loading saved consents…</p> : consents.length === 0 ?
        <p className="consent-subtext">No consents recorded yet. Your financial information is not shared with lenders.</p> :
        <div className="consent-history">{consents.map(item => <div className="consent-entry" key={item.id}>
          <div className="consent-entry-top"><strong>{item.active ? "Active consent" : "Inactive consent"}</strong><span className={item.active ? "consent-status active" : "consent-status"}>{item.active ? "Active" : "Expired / revoked"}</span></div>
          <div className="consent-entry-meta">Granted: {new Date(item.created_at).toLocaleDateString()} · Expires: {item.expires_at ? new Date(item.expires_at).toLocaleDateString() : "Not set"}</div>
          <div className="consent-entry-scopes">{Object.entries(item.scopes).filter(([, allowed]) => allowed).map(([scope]) => <span key={scope}>{scope}</span>)}</div>
          {item.active && <button className="btn btn-outline" disabled={busy} onClick={() => revoke(item.id)}>Revoke consent</button>}
        </div>)}</div>}
      <div className="inline-note"><Icon name="circle-alert" size={17}/>This is a hackathon-grade consent interface. Real bank data connections and verified financial assessments are not yet implemented.</div>
    </section>
  </div>;
}
