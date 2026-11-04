import Link from "next/link";
import { Brand } from "@/components/brand";
import { AssessmentLab } from "@/components/assessment-lab";
import { Icon } from "@/components/icon";
export const metadata = { title: "EarnScore | Interactive financial sandbox", description: "Explore a fictional, transparent financial-pattern scoring demo." };
export default function Demo() {return <div className="demo-public"><header className="demo-header"><Brand/><Link href="/" className="btn btn-outline"><Icon name="arrow-left" size={16}/> Back to home</Link></header><main className="demo-main"><div className="demo-intro"><span className="eyebrow">THE DEMO EXPERIENCE</span><h1>A score you can <em>understand.</em></h1><p>Explore how regularity, volatility, cash flow, debt burden and income-source concentration affect an illustrative assessment. No registration needed.</p></div><AssessmentLab/></main><footer className="demo-footer">EarnScore hackathon sandbox · Fictional data only · No real lending decisions</footer></div>}
