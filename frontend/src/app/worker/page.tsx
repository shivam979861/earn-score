import { OverviewPage } from "@/components/overview-page";
import { getOverview, requireRole } from "@/lib/server-auth";
export default async function Page() {
  const user = await requireRole("worker");
  const overview = await getOverview("worker");
  return <OverviewPage user={user} role="worker" overview={overview} />;
}
