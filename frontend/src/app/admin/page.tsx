import { OverviewPage } from "@/components/overview-page";
import { getOverview, requireRole } from "@/lib/server-auth";
export default async function Page() {
  const user = await requireRole("admin");
  const overview = await getOverview("admin");
  return <OverviewPage user={user} role="admin" overview={overview} />;
}
