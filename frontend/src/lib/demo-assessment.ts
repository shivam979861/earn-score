/** Educational, deterministic sandbox logic. No repayment outcome prediction. */
export type DemoScenario = "consistent" | "volatile" | "pressured";
export type Scenario = { title: string; description: string; monthlyIncome: number[]; livingCosts: number; existingEmi: number; largestSourcePct: number };
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
export const SCENARIOS: Record<DemoScenario, Scenario> = {
  consistent: { title: "Consistent earnings", description: "Six earning months, multiple sources and manageable commitments.", monthlyIncome: [28000,32000,30000,35000,29000,34000], livingCosts: 18000, existingEmi: 3500, largestSourcePct: 52 },
  volatile: { title: "Volatile earnings", description: "High-income peaks mixed with several low earning months.", monthlyIncome: [12000,59000,17000,54000,9500,52000], livingCosts: 18500, existingEmi: 4000, largestSourcePct: 82 },
  pressured: { title: "Cash-flow pressure", description: "Reasonably steady income but substantial expenses and existing EMIs.", monthlyIncome: [26500,29000,27000,28000,25500,30000], livingCosts: 20000, existingEmi: 7200, largestSourcePct: 68 },
};
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const rupees = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
export type ComponentScore = { name: string; value: number; weight: number; reason: string };
export type AssessmentOutput = {
  total: number; mean: number; median: number; cv: number; coverage: number; monthlyNet: number;
  debtRatio: number; sourceShare: number; components: ComponentScore[]; risks: string[];
};
export function assess(input: Scenario): AssessmentOutput {
  const incomes = input.monthlyIncome.map(n => Math.max(0, Number.isFinite(n) ? n : 0));
  const months = incomes.length;
  const mean = months > 0 ? incomes.reduce((a,b) => a + b, 0) / months : 0;
  const sorted = [...incomes].sort((a,b) => a - b);
  const median = months === 0 ? 0 : months % 2 ? sorted[Math.floor(months/2)] : (sorted[months/2-1] + sorted[months/2])/2;
  const variance = months ? incomes.reduce((s,x) => s + (x - mean) ** 2, 0)/months : 0;
  const cv = mean ? Math.sqrt(variance)/mean : 1;
  const coverage = months ? incomes.filter(n => n > 0).length / months : 0;
  const livingCosts = Math.max(0,input.livingCosts);
  const existingEmi = Math.max(0,input.existingEmi);
  const monthlyNet = mean-livingCosts-existingEmi;
  const debtRatio = mean > 0 ? existingEmi/mean : 1;
  const sourceShare = clamp(input.largestSourcePct, 0, 100)/100;
  const components: ComponentScore[] = [
    {name:"Income regularity",value:Math.round(coverage*100),weight:30,reason:`Positive recorded income in ${incomes.filter(n=>n>0).length} of ${months} sample months`},
    {name:"Income stability",value:Math.round(clamp((1-cv/.65)*100,0,100)),weight:25,reason:`Coefficient of variation: ${(cv*100).toFixed(1)}% (lower is steadier)`},
    {name:"Cash-flow headroom",value:Math.round(clamp(monthlyNet/(Math.max(mean,1)*.40)*100,0,100)),weight:20,reason:`Average surplus after assumed costs and existing EMI: ${rupees(monthlyNet)}`},
    {name:"Known debt load",value:Math.round(clamp((1-debtRatio/.50)*100,0,100)),weight:15,reason:`Existing EMI / mean income: ${(debtRatio*100).toFixed(1)}%`},
    {name:"Source diversification",value:Math.round(clamp((1-Math.max(0,sourceShare-.25)/.75)*100,0,100)),weight:10,reason:`Largest income source accounts for ${(sourceShare*100).toFixed(0)}% of earnings`},
  ];
  const total=Math.round(components.reduce((sum,c)=>sum+c.value*c.weight,0)/10);
  const risks: string[]=[];
  if (cv >= .35) risks.push("High monthly earnings variation may reduce predictable repayment cash flow.");
  if (monthlyNet <= 0) risks.push("Assumed living costs and existing EMIs meet or exceed average earnings.");
  else if (monthlyNet < mean*.15) risks.push("Thin cash-flow headroom after assumed expenses and current EMIs.");
  if (debtRatio >= .30) risks.push("Existing EMI obligations are at least 30% of mean earnings.");
  if (sourceShare >= .75) risks.push("Earnings depend heavily on one platform or client.");
  if (!risks.length) risks.push("No rule-based financial-pattern warnings under the current demo assumptions. Verification is still required.");
  return { total, mean, median, cv, coverage, monthlyNet, debtRatio, sourceShare, components, risks };
}
