/** Client-side preview only: no server submission, no persistence, no verification. */
export type PreviewRow = {
  id: string; date: string; description: string; amount: number;
  category: string; source: string; potentialDuplicate: boolean; needsReview: boolean;
};
export type StatementPreview = {
  rows: PreviewRow[];
  skipped: number;
  income: number;
  outflows: number;
  transfers: number;
  flagged: number;
};

export function parseCSV(input: string): string[][] {
  const content = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  for (let i=0;i<content.length;i++) {
    const c=content[i];
    if (c==='"') {
      if (quoted && content[i+1]==='"') { cell+='"'; i++; }
      else quoted = !quoted;
    } else if (!quoted && c===",") { row.push(cell.trim()); cell=""; }
    else if (!quoted && (c==="\n" || c==="\r")) {
      if (c==="\r" && content[i+1]==="\n") i++;
      row.push(cell.trim()); if (row.some(x=>x!=="")) rows.push(row);
      row=[];cell="";
    } else cell+=c;
  }
  if (quoted) throw new Error("The file contains an unfinished quoted field.");
  row.push(cell.trim()); if (row.some(x=>x!=="")) rows.push(row);
  return rows;
}

export function previewStatement(csv: string): StatementPreview {
  const raw = parseCSV(csv);
  if (raw.length < 2) throw new Error("Add a header and at least one transaction row.");
  if (raw.length > 10001) throw new Error("For privacy and performance, preview at most 10,000 transactions at a time.");
  const names = raw[0].map(h=>h.toLowerCase().trim().replace(/\s+/g,"_"));
  const get=(options: string[])=>options.map(x=>names.indexOf(x)).find(x=>x>=0) ?? -1;
  const dates=get(["date","transaction_date","posted_date"]);
  const descriptions=get(["description","narration","details","merchant"]);
  const amounts=get(["amount","transaction_amount"]);
  const credits=get(["credit","credit_amount"]);
  const debits=get(["debit","debit_amount"]);
  const category=get(["category","transaction_type"]);
  const source=get(["source","platform","account"]);
  if (dates<0 || descriptions<0 || (amounts<0 && (credits<0 || debits<0))) throw new Error("Required columns: date, description and amount (or credit and debit). Download the sample CSV to see the format.");
  const parsed: PreviewRow[]=[]; let skipped=0;
  raw.slice(1).forEach((fields,i)=>{
    const text=(col:number)=>col<0?"":(fields[col] ?? "").trim();
    const value=amounts>=0 ? Number(text(amounts).replace(/[,₹\s]/g,"")) : Number(text(credits).replace(/[,₹\s]/g,"")||0)-Number(text(debits).replace(/[,₹\s]/g,"")||0);
    if (!text(dates) || !text(descriptions) || !Number.isFinite(value) || (amounts>=0 && text(amounts)==="")) { skipped++;return; }
    const cat=text(category).toLowerCase();
    const desc=text(descriptions);
    const transfer=cat.includes("transfer") || /self[\s_-]*transfer|own account/i.test(desc);
    const needsReview=transfer || !cat || cat.includes("duplicate") || (value>0 && !["income","self_reported_income","earning","payout","salary","revenue"].some(k=>cat.includes(k)));
    parsed.push({id:`row-${i+2}`,date:text(dates),description:desc.slice(0,250),amount:value,category:cat || "uncategorized",source:text(source)||"Unspecified",potentialDuplicate:false,needsReview});
  });
  if (!parsed.length) throw new Error("No valid transactions found. Please check the date, description, and amount columns.");
  // Warning only, never automatically erase or combine same-day equal-amount payouts.
  const first = new Map<string,number>();
  for (let i=0;i<parsed.length;i++) {
    const p=parsed[i];
    if(p.amount<=0)continue;
    const key=`${p.date}|${p.amount}`;
    if(first.has(key)) {
      const earlier=parsed[first.get(key)!];
      if (earlier.source!==p.source) { earlier.potentialDuplicate=true; earlier.needsReview=true; p.potentialDuplicate=true; p.needsReview=true; }
    } else first.set(key,i);
  }
  const income=parsed.reduce((sum,p)=>sum+(p.amount>0 && !p.needsReview && ["income","earning","payout","salary","revenue"].some(c=>p.category.includes(c))?p.amount:0),0);
  const outflows=parsed.reduce((sum,p)=>sum+(p.amount<0?Math.abs(p.amount):0),0);
  const transfers=parsed.filter(p=>p.category.includes("transfer") || /self[\s_-]*transfer|own account/i.test(p.description)).length;
  return {rows:parsed,skipped,income,outflows,transfers,flagged:parsed.filter(p=>p.needsReview).length};
}
