import { NextResponse } from "next/server";
import { authorizedBackend, forwardJSON, rejectCrossOrigin } from "@/lib/proxy-auth";

export async function GET() {
  return forwardJSON(await authorizedBackend("/worker/consents"));
}

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 });
  }
  return forwardJSON(await authorizedBackend("/worker/consents", {
    method: "POST", body: JSON.stringify(body),
  }));
}
