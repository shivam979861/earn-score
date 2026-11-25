import { authorizedBackend, forwardJSON } from "@/lib/proxy-auth";
export async function GET() {
  return forwardJSON(await authorizedBackend("/worker/reconciliation"));
}
