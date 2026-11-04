"use client";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { assess, rupees, SCENARIOS } from "@/lib/demo-assessment";
const sample=assess(SCENARIOS.consistent);
const checks=[
  {name:"Worker authorization",detail:"No real consent grant exists in this fictional sample.",status:"not verified"},
  {name:"Bank record ownership",detail:"No bank ownership evidence connected.",status:"not verified"},
  {name:"Payout reconciliation",detail:"Illustrative income series; no source documents.",status:"not verified"},
  {name:"Existing debt obligations",detail:"EMI based on a sample assumption, not lender data.",status:"not verified"},
  {name:"Income history coverage",detail:"Six fictional months are provided for the demo.",status:"sample only"},
];
export function LenderDemo(){
 const [tab,setTab]=useState<"summary"|"verification"|"review">("summary");
 const [checked,setChecked]=useState<string[]>([]);
 const [notes,setNotes]=useState("");
 const [decision,setDecision]=useState("hold");
 const [saved,setSaved]=useState(false);
 const toggle=(n:string)=>{setChecked(prev=>prev.includes(n)?prev.filter(v=>v!==n):[...prev,n]);setSaved(false)};
 return <div className="review-demo">
  <div className="review-banner"><Icon name="shield-alert" size={19}/><div><strong>Fictional case preview · no borrower data</strong><span>All evidence is unverified. Any review action is local to this screen and does not affect a real applicant.</span></div></div>
  <div className="review-header"><div><span className="eyebrow">LENDER / CASE SANDBOX</span><h1>Financial assessment review</h1><p>Practice reading a transparent assessment, checking evidence and recording a human review outcome.</p></div><span className="phase-badge">DEMO-CASE-001</span></div>
  <div className="review-kpi-grid"><div className="card"><small>Illustrative financial score</small><strong>{sample.total}<span>/1000</span></strong><p>Not a default probability</p></div><div className="card"><small>Mean recorded income</small><strong>{rupees(sample.mean)}</strong><p>Fictional six-month period</p></div><div className="card"><small>Evidence status</small><strong className="review-warning">Unverified</strong><p>Original records not supplied</p></div></div>
  <div className="review-tabs" role="tablist" aria-label="Fictional case sections">{[{key:"summary",text:"Score & factors"},{key:"verification",text:"Evidence checklist"},{key:"review",text:"Human review"}].map(t=><button type="button" role="tab" aria-selected={tab===t.key} key={t.key} className={tab===t.key?"active":""} onClick={()=>setTab(t.key as typeof tab)}>{t.text}</button>)}</div>
  {tab==="summary"&&<div className="card review-section reveal"><div className="lab-card-head"><div><span className="card-overline">TRANSPARENT SCORING</span><h2>Five contributing factors</h2></div><span className="lab-muted">Heuristic vDEMO-1</span></div><div className="review-factor-table">{sample.components.map(c=><div className="review-factor-item" key={c.name}><span><strong>{c.name}</strong><small>{c.reason}</small></span><span className="review-factor-score">{c.value}/100 <small>· {c.weight}%</small></span></div>)}</div><div className="inline-note"><Icon name="circle-alert" size={17}/>Score is demonstrative only. A financial score is not a verified lending decision, repayment likelihood or risk grade.</div></div>}
  {tab==="verification"&&<section className="card review-section reveal"><div className="lab-card-head"><div><span className="card-overline">EVIDENCE FIRST</span><h2>Verification checklist</h2></div><span className="lab-muted">{checked.length}/{checks.length} items reviewed</span></div><p className="lab-subtext">Ticking an item marks it as reviewed in this demo; it does not verify financial evidence.</p><div className="verification-list">{checks.map(c=><label key={c.name} className="verification-item"><input type="checkbox" checked={checked.includes(c.name)} onChange={()=>toggle(c.name)}/><span><strong>{c.name}</strong><small>{c.detail}</small></span><em>{c.status}</em></label>)}</div></section>}
  {tab==="review"&&<section className="card review-section reveal"><div className="lab-card-head"><div><span className="card-overline">HUMAN OVERSIGHT</span><h2>Practice a lender review</h2></div><Icon name="clipboard-check" size={22}/></div><p className="lab-subtext">Record a fictional review outcome. This is intentionally not connected to loan approval APIs.</p><label className="review-field">Illustrative review action<select value={decision} onChange={e=>{setDecision(e.target.value);setSaved(false)}}><option value="hold">Hold — additional verification required</option><option value="request">Request documentation</option><option value="decline">Simulate lender decline</option><option value="approve">Simulate lender approval</option></select></label><label className="review-field">Reviewer reasoning<textarea maxLength={1200} rows={4} value={notes} onChange={e=>{setNotes(e.target.value);setSaved(false)}} placeholder="Describe supporting facts and what needs checking..."/></label><button className="btn btn-primary" disabled={!notes.trim()} onClick={()=>setSaved(true)}><Icon name="check-circle-2" size={17}/> Save local simulation</button>{saved&&<div className="success-note" role="status"><Icon name="check-circle-2" size={17}/>Saved only in this browser view: {decision}. No actual borrower, application or loan has been changed.</div>}</section>}
 </div>
}
