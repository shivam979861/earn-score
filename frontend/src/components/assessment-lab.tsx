"use client";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { assess, clamp, MONTHS, rupees, SCENARIOS, type DemoScenario } from "@/lib/demo-assessment";

const tabs: DemoScenario[] = ["consistent", "volatile", "pressured"];
function Slider({ label, value, min, max, step=500, format=rupees, onChange, help }: { label:string;value:number; min:number;max:number;step?:number;format?:(n:number)=>string;onChange:(n:number)=>void;help?:string }) {
  return <label className="lab-slider"><span className="lab-slider-label"><strong>{label}</strong><output>{format(value)}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.currentTarget.value))}/>{help && <small>{help}</small>}</label>;
}
export function AssessmentLab({ compact=false }: {compact?: boolean}) {
  const [scenarioId,setScenarioId] = useState<DemoScenario>("consistent");
  const [livingCosts,setLivingCosts] = useState(SCENARIOS.consistent.livingCosts);
  const [existingEmi,setExistingEmi] = useState(SCENARIOS.consistent.existingEmi);
  const [newEmi,setNewEmi] = useState(3000);
  const [largestSourcePct,setLargestSourcePct] = useState(SCENARIOS.consistent.largestSourcePct);
  const [detail,setDetail] = useState<"factors"|"risks">("factors");
  const [showControls,setShowControls] = useState(false);
  const selected=SCENARIOS[scenarioId];
  const result=useMemo(()=>assess({...selected,livingCosts,existingEmi,largestSourcePct}),[selected,livingCosts,existingEmi,largestSourcePct]);
  const postEmi=result.monthlyNet-newEmi;
  const lowestMonth=Math.min(...selected.monthlyIncome);
  const lowestMonthAfter=lowestMonth-livingCosts-existingEmi-newEmi;
  function chooseScenario(id:DemoScenario){setScenarioId(id);setLivingCosts(SCENARIOS[id].livingCosts);setExistingEmi(SCENARIOS[id].existingEmi);setLargestSourcePct(SCENARIOS[id].largestSourcePct);setNewEmi(3000);}
  return <section className={`lab ${compact?"lab-compact":""}`} aria-label="Simulated financial pattern assessment">
    <div className="lab-head"><div><span className="section-kicker">INTERACTIVE SANDBOX / VERSION DEMO-1</span><h2>Explore the financial signals.</h2><p>Change the assumptions and see the calculations update instantly. Every number here is fictional and stays in your browser.</p></div><span className="lab-badge"><Icon name="flask-conical" size={15}/> SIMULATION ONLY</span></div>
    <div className="scenario-tabs" role="group" aria-label="Choose a fictional earnings scenario">{tabs.map(tab=><button key={tab} type="button" onClick={()=>chooseScenario(tab)} aria-pressed={scenarioId===tab} className={`scenario-tab ${scenarioId===tab?"scenario-selected":""}`}>{SCENARIOS[tab].title}</button>)}</div>
    <div className="lab-toolbar"><button className="btn btn-outline" type="button" aria-expanded={showControls} onClick={()=>setShowControls(x=>!x)}><Icon name="sliders-horizontal" size={17}/>{showControls ? "Hide assumptions" : "Adjust monthly costs and EMIs"}</button><button className="lab-reset" type="button" onClick={()=>{chooseScenario("consistent");setDetail("factors");setShowControls(false);}}>Reset demo</button></div>
    <div className="lab-grid">
      <div className="lab-left">
        <div className="card lab-chart-card"><div className="lab-card-head"><div><span className="card-overline">RECORDED MONTHLY INCOME</span><h3>{selected.title}</h3></div><span className="lab-muted">6 sample months</span></div><p className="lab-subtext">{selected.description}</p><div className="income-bars" role="img" aria-label={`Monthly earnings: ${selected.monthlyIncome.map((x,i)=>`${MONTHS[i]} ${rupees(x)}`).join(", ")}`}>{selected.monthlyIncome.map((v,i)=><div className="income-bar-col" key={`${scenarioId}-${i}`}><span className="income-bar-value">{(v/1000).toFixed(v%1000?1:0)}k</span><span className="income-bar-track"><span className="income-bar-fill" style={{height:`${Math.max(6, v/60000*100)}%`,animationDelay:`${i*65}ms`}}/></span><small>{MONTHS[i]}</small></div>)}</div><div className="lab-kpi-row"><div><span>Mean income</span><strong>{rupees(result.mean)}</strong></div><div><span>Median income</span><strong>{rupees(result.median)}</strong></div><div><span>Volatility (CV)</span><strong>{(result.cv*100).toFixed(1)}%</strong></div></div></div>
        {showControls && <div className="card lab-controls"><div className="lab-card-head"><div><span className="card-overline">ADJUST ASSUMPTIONS</span><h3>Monthly cash flow</h3></div><Icon name="sliders-horizontal" size={20}/></div><Slider label="Essential monthly spending" min={5000} max={40000} step={500} value={livingCosts} onChange={setLivingCosts} help="Illustrative living/working expenses, not verified"/><Slider label="Existing monthly EMIs" min={0} max={25000} step={250} value={existingEmi} onChange={setExistingEmi} help="Assumes known and complete obligations"/><Slider label="Largest payer share" min={25} max={100} step={1} value={largestSourcePct} onChange={setLargestSourcePct} format={v=>`${v}%`}/><Slider label="Hypothetical new EMI" min={500} max={15000} step={250} value={newEmi} onChange={setNewEmi} help="New EMI only affects stress test, not the baseline score"/></div>}
      </div>
      <div className="lab-right">
        <div className="card score-card"><div className="score-header"><span className="card-overline">ALTERNATIVE FINANCIAL-PATTERN SCORE</span><Icon name="info" size={18}/></div><div className="score-number"><strong key={result.total}>{result.total}</strong><span>/ 1000</span></div><div className="score-track"><span style={{width:`${clamp(result.total/10,0,100)}%`}}/></div><p>Weighted demonstration score — not a bureau score, default probability, or approval recommendation.</p><div className="score-caveat"><Icon name="shield-alert" size={17}/> Evidence confidence: <strong>Not verified</strong></div></div>
        <div className="card lab-analysis"><div className="analysis-switch" role="group" aria-label="Assessment details"><button type="button" className={detail==="factors"?"active":""} aria-pressed={detail==="factors"} onClick={()=>setDetail("factors")}>Score drivers</button><button type="button" className={detail==="risks"?"active":""} aria-pressed={detail==="risks"} onClick={()=>setDetail("risks")}>Review flags <span>{result.risks.length}</span></button></div>{detail==="factors"?<div className="factor-list">{result.components.map(f=><div className="factor-row" key={f.name}><div className="factor-label"><span>{f.name}<small>{f.weight}% weight</small></span><strong>{f.value}/100</strong></div><div className="factor-meter"><span style={{width:`${f.value}%`}}/></div><small>{f.reason}</small></div>)}</div>:<ul className="risk-list">{result.risks.map(r=><li key={r}><Icon name={r.startsWith("No rule-based") ? "check-circle-2" : "alert-triangle"} size={17}/><span>{r}</span></li>)}</ul>}</div>
        <div className="card stress-card"><div className="lab-card-head"><div><span className="card-overline">REPAYMENT STRESS TEST</span><h3>After proposed EMI</h3></div><Icon name="activity" size={20}/></div><div className={`stress-result ${postEmi>=0?"positive":"negative"}`}><span>Average monthly headroom</span><strong>{rupees(postEmi)}</strong></div><div className={`stress-result ${lowestMonthAfter>=0?"positive":"negative"}`}><span>Lowest earning month headroom</span><strong>{rupees(lowestMonthAfter)}</strong></div><p>Headroom = earnings − assumed living costs − existing EMIs − hypothetical EMI. It is not an affordability approval.</p></div>
      </div>
    </div>
    <div className="lab-disclaimer"><Icon name="circle-alert" size={18}/><div><strong>Data-quality and fairness boundary.</strong> This tool uses invented earnings, user-adjustable costs, and a simplified weighted heuristic. It does not verify statements, include all liabilities, account for household context, or make lending decisions. Actual scoring requires validated data, consent, fairness testing, and human review.</div></div>
  </section>;
}
