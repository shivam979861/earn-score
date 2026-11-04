import { NextResponse } from "next/server";
import { authorizedBackend, forwardJSON, rejectCrossOrigin } from "@/lib/proxy-auth";

export async function PATCH(req: Request, { params }: { params: Promise<{id: string}> }) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 }); }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ detail: "Invalid user ID" }, { status: 400 });
  return forwardJSON(await authorizedBackend(`/admin/users/${id}/status`, { method: "PATCH", body: JSON.stringify(body) }));
}
