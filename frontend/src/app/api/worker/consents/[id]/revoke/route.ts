import { authorizedBackend, forwardJSON, rejectCrossOrigin } from "@/lib/proxy-auth";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  const { id } = await ctx.params;
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
    return Response.json({ detail: "Invalid consent identifier" }, { status: 400 });
  }
  return forwardJSON(await authorizedBackend(`/worker/consents/${id}/revoke`, { method: "POST" }));
}
