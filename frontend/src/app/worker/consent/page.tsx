import Link from "next/link";
import { Icon } from "@/components/icon";
import { WorkerConsentManager } from "@/components/worker-consent-manager";

export default function Page() {
  return <>
    <div className="breadcrumb"><Link href="/worker">Dashboard</Link><Icon name="chevron-right" size={15}/><span>Data sharing & consent</span></div>
    <div className="page-heading"><div><div className="eyebrow">PRIVACY CONTROLS</div><h1>Data sharing & consent</h1><p>Manage what lenders may receive and revoke access permissions.</p></div><span className="phase-badge">CONNECTED TO BACKEND</span></div>
    <WorkerConsentManager />
  </>;
}
