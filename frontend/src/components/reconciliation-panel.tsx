"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";

type Row = { id: string; date: string; description: string; source: string; source_kind: string; reference: string; amount: string; category: string; classification_reason: string; payer: string | null; flags: string[]; status: string; match_id: string | null };
type Result = { version: string; rows: Row[]; pairs: { platform_id: string; bank_id: string; payer: string; amount: string; reason: string }[]; summary: { records: number; matched_pairs: number; matched_amount: string; review_count: number; verified_count: number } };
const human = (v: string) => v.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
const money = (v: string) => Number(v).toLocaleString("en-IN", { style: "currency", currency: "INR" });

export function ReconciliationPanel() {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/worker/reconciliation", { cache: "no-store", signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(typeof body.detail === "string" ? body.detail : "Unable to load saved transactions"); return body as Result; })
      .then(body => { setData(body); setLoading(false); })
      .catch(e => { if (!controller.signal.aborted) { setError(String(e.message || e)); setLoading(false); } });
    return () => controller.abort();
  }, [refresh]);
  const visible = (data?.rows ?? []).filter(r => (filter === "all" || r.status === filter || (filter === "review" && ["needs_review", "ambiguous", "unmatched"].includes(r.status))) && [r.description,r.source,r.category,r.reference].join(" ").toLowerCase().includes(search.toLowerCase().trim()));
  const safePage = Math.min(page, Math.max(0, Math.ceil(visible.length / 25) - 1));
  const byId = new Map((data?.rows ?? []).map(r => [r.id, r]));
  return <div className="statement-tool">
    <div className="new-page-heading"><span className="ui-kicker">WORKER WORKSPACE · SAVED RECORDS</span><h1>Understand your transactions</h1><p>See suggested categories and compare bank deposits with gig-platform payouts.</p></div>
    <section className="privacy-strip"><Icon name="shield-check" size={20}/><div><strong>Matched does not mean verified</strong><span>All uploaded records are self-reported. A match only means the two records agree; it is not bank authentication or credit approval.</span></div></section>
    <div className="csv-mapping-actions"><Link className="btn btn-primary" href="/worker/uploads">Add a statement <Icon name="arrow-right" size={16}/></Link><button className="btn btn-outline" disabled={loading} onClick={() => { setLoading(true); setError(""); setRefresh(n => n+1); }}>Refresh analysis</button></div>
    {loading && <p role="status">Analyzing your saved records…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {!loading && !error && data && <>
      <div className="statement-metrics"><div className="statement-metric"><span>Saved records</span><strong>{data.summary.records}</strong><small>All unverified</small></div><div className="statement-metric"><span>Matched payouts</span><strong>{data.summary.matched_pairs}</strong><small>{money(data.summary.matched_amount)} counted once across pairs</small></div><div className="statement-metric"><span>Needs attention</span><strong>{data.summary.review_count}</strong><small>Unmatched, ambiguous or flagged</small></div></div>
      <section className="card statement-table-card"><div className="csv-section-heading"><div><h3>Saved transactions</h3><p>Expand any row to see its classification reason, flags and matching evidence.</p></div></div>
        <div className="csv-toolbar"><label className="csv-search"><Icon name="search" size={17}/><input aria-label="Search saved transactions" placeholder="Search transactions" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/></label><label>Status<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(0);}}><option value="all">All records</option><option value="matched">Matched</option><option value="review">Needs attention</option><option value="unmatched">Unmatched</option><option value="ambiguous">Ambiguous</option><option value="not_applicable">Not applicable</option></select></label></div>
        <div className="statement-scroll"><table className="statement-table"><thead><tr><th>Date / source</th><th>Description</th><th>Category</th><th>Amount</th><th>Reconciliation</th></tr></thead><tbody>{visible.slice(safePage*25,safePage*25+25).map(r=><tr key={r.id}><td>{r.date}<small className="csv-ref">{human(r.source_kind)} · {r.source}</small></td><td>{r.description}<small className="csv-ref">{r.reference}</small></td><td>{human(r.category)}</td><td className={Number(r.amount)>0?"money-positive":"money-negative"}>{money(r.amount)}</td><td><details className="csv-row-issues"><summary className={`data-tag ${["needs_review","ambiguous","unmatched"].includes(r.status)?"review":""}`}>{human(r.status)}</summary><p>{r.classification_reason}</p>{r.match_id && <p>Matched with {byId.get(r.match_id)?.description} on {byId.get(r.match_id)?.date}. Exact amount, payer and 0–3 day settlement window.</p>}{r.flags.length>0 && <ul>{r.flags.map(f=><li key={f}>{f}</li>)}</ul>}<p>Verification: unverified</p></details></td></tr>)}</tbody></table>{!visible.length && <p className="empty-note">{data.summary.records===0?"No saved statements yet. Add a bank and platform CSV to try reconciliation.":"No transactions match your filters."}</p>}</div>
        <div className="csv-mapping-actions"><span>{visible.length} matching records · Page {safePage+1} of {Math.max(1,Math.ceil(visible.length/25))}</span><button className="btn btn-outline" disabled={safePage===0} onClick={()=>setPage(safePage-1)}>Previous</button><button className="btn btn-outline" disabled={(safePage+1)*25>=visible.length} onClick={()=>setPage(safePage+1)}>Next</button></div>
      </section><section className="roadmap-note"><Icon name="info" size={19}/><div><strong>How matches are found</strong><p>Declare each statement as bank or platform when saving. Recognized payer names and exact amounts must agree; bank dates must follow payouts by no more than three days. Duplicate or ambiguous rows are not paired. Older imports without a statement type stay in review. No assessment is calculated.</p></div></section>
    </>}
  </div>;
}
