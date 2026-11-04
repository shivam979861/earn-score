import { OverviewPage } from "@/components/overview-page";
import { getOverview, requireRole } from "@/lib/server-auth";
export default async function Page() {
  const user = await requireRole("lender");
  const overview = await getOverview("lender");
  return <OverviewPage user={user} role="lender" overview={overview} />;
}
