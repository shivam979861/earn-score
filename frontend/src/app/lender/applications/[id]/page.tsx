import Link from "next/link";
import { Icon } from "@/components/icon";
export default async function CaseDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><div className="breadcrumb"><Link href="/lender/applications">Applications</Link><Icon name="chevron-right" size={15}/>Case detail</div>
  <div className="page-heading"><div><div className="eyebrow">RESTRICTED CASE VIEW</div><h1>Assessment case</h1><p>Case reference: {id}</p></div></div>
  <div className="card empty-case"><Icon name="shield-check" size={32}/><h2>No access grant found</h2><p>Case records must only be loaded after the backend verifies an active, applicant-authorized lender access grant. This page is a route placeholder, not a case data endpoint.</p><Link className="btn btn-dark" href="/lender/applications">Return to applications</Link></div></>;
}
