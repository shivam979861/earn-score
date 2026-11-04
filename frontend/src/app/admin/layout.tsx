import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal-shell";
import { requireRole } from "@/lib/server-auth";
export default async function Layout({children}: {children: ReactNode}) {
  const user = await requireRole("admin");
  return <PortalShell role="admin" user={user}>{children}</PortalShell>;
}
