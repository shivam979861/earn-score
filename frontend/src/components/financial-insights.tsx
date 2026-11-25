"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";

type Money = string | null;
type Month = { month: string; bank_records: number; eligible_income: Money; observed_expenses: Money; observed_debt_payments: Money; held_records: number };
type Result = { status: string; version: string; window: { start: string | null; end: string | null; bank_observed_months: number; earning_observed_months: number; missing_months: string[] }; metrics: { eligible_income: Money; average_observed_earnings: Money; income_observation_rate_pct: number | null; volatility_pct: number | null; income_change_pct: number | null; observed_residual: Money; residual_months: number; observed_debt_to_income_pct: number | null; debt_observed_months: number; largest_payer_share_pct: number | null }; monthly: Month[]; payers: { payer: string; income: string; share_pct: number }[]; excluded: Record<string, number>; limitations: string[] };
const money = (v: Money) => v === null ? "Not available" : Number(v).toLocaleString("en-IN", {style:"currency",currency:"INR", maximumFractionDigits:2});
const pct = (v: number | null) => v === null ? "Not available" : `${v.toFixed(1)}%`;
const label = (v: string) => v.replaceAll("_", " ").replace(/^./, c=>c.toUpperCase());
export function FinancialInsights() {
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(()=>{
    const controller = new AbortController();
    fetch("/api/worker/financial-features", {cache:"no-store",signal:controller.signal})
      .then(async r=>{const b=await r.json(); if(!r.ok) throw new Error(typeof b.detail === "string" ? b.detail : "Cannot load insights"); return b as Result;})
      .then(b=>{setResult(b);setLoading(false);})
      .catch(e=>{if(!controller.signal.aborted){setError(String(e.message||e));setLoading(false);}});
    return ()=>controller.abort();
  },[revision]);
  const m=result?.metrics;
  const max=Math.max(1,...(result?.monthly??[]).map(v=>Number(v.eligible_income??0)));
  return <div className="statement-tool">
    <div className="new-page-heading"><span className="ui-kicker">WORKER WORKSPACE · FINANCIAL INSIGHTS</span><h1>Understand your earnings</h1><p>See patterns in saved bank records, without counting platform copies twice.</p></div>
    <section className="privacy-strip"><Icon name="shield-check" size={20}/><div><strong>Provisional, not independently verified</strong><span>These are descriptive metrics from uploaded records, not an EarnScore or loan approval. Missing records do not mean zero income or zero debt.</span></div></section>
    <div className="csv-mapping-actions"><Link className="btn btn-primary" href="/worker/uploads">Add a statement</Link><Link className="btn btn-outline" href="/worker/transactions">Review transactions</Link><button className="btn btn-outline" disabled={loading} onClick={()=>{setLoading(true);setError("");setRevision(v=>v+1);}}>Refresh</button></div>
    {loading && <p role="status">Calculating your financial insights…</p>}{error && <p role="alert" className="form-error">{error}</p>}
    {!loading && !error && result && m && <>
      <section className="card" style={{padding:20}}><h3>Data coverage</h3><p>{result.window.start ? `${result.window.start} to ${result.window.end}` : "No eligible bank statement dates yet"}. {result.window.bank_observed_months}/6 months have bank records; {result.window.earning_observed_months} have eligible earnings. Full statement coverage is not confirmed.</p>{result.status==="insufficient_data" && <p>Add bank statements with recognizable payout descriptions to calculate eligible earnings.</p>}{result.window.missing_months.length>0 && <p>Missing months: {result.window.missing_months.join(", ")}</p>}</section>
      <div className="statement-metrics">{[["Average observed earnings",money(m.average_observed_earnings),"Only months with eligible credits"],["Income observation rate",pct(m.income_observation_rate_pct),"Earning months / bank-observed months"],["Income volatility",pct(m.volatility_pct),"Needs 3 consecutive earning months"],["Income change",pct(m.income_change_pct),"First to last eligible month; same history requirement"],["Recorded residual",money(m.observed_residual),`${m.residual_months} months with income, expense and debt records`],["Observed debt / income",pct(m.observed_debt_to_income_pct),`${m.debt_observed_months} months with recorded debt`],["Largest payer share",pct(m.largest_payer_share_pct),"Share of eligible bank earnings"]].map(([name,value,note])=><div className="statement-metric" key={name}><span>{name}</span><strong>{value}</strong><small>{note}</small></div>)}</div>
      <section className="card statement-table-card"><div className="csv-section-heading"><div><h3>Monthly earnings</h3><p>Eligible bank credits total: {money(m.eligible_income)}. Gaps are unknown, not zero.</p></div></div><div style={{display:"grid",gap:12,padding:16}}>{result.monthly.map(v=><div key={v.month}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><span>{v.month}</span><strong>{money(v.eligible_income)}</strong></div><div style={{height:10,background:"rgba(128,128,128,.13)",borderRadius:8,overflow:"hidden"}}>{v.eligible_income!==null && <div style={{width:`${Number(v.eligible_income)/max*100}%`,height:"100%",background:"#15967d",borderRadius:8,transition:"width .35s ease"}}/>}</div></div>)}</div><div className="statement-scroll"><table className="statement-table"><thead><tr><th>Month</th><th>Bank records</th><th>Expenses</th><th>Debt payments</th><th>Held</th></tr></thead><tbody>{result.monthly.map(v=><tr key={v.month}><td>{v.month}</td><td>{v.bank_records}</td><td>{money(v.observed_expenses)}</td><td>{money(v.observed_debt_payments)}</td><td>{v.held_records}</td></tr>)}</tbody></table></div></section>
      <section className="card" style={{padding:20}}><h3>Income sources</h3>{result.payers.length===0?<p>No eligible payer totals available.</p>:result.payers.map(p=><div key={p.payer} style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 0"}}><span>{label(p.payer)}</span><strong>{money(p.income)} · {pct(p.share_pct)}</strong></div>)}</section>
      <section className="card" style={{padding:20}}><h3>Excluded records</h3>{Object.entries(result.excluded).length===0?<p>No exclusions recorded.</p>:Object.entries(result.excluded).map(([k,v])=><p key={k}>{label(k)}: {v}</p>)}<details><summary>How these figures are calculated</summary><ul>{result.limitations.map(v=><li key={v}>{v}</li>)}</ul><small>Method: {result.version}</small></details></section>
    </>}
  </div>;
}
