import { NextResponse } from "next/server";
import { authorizedBackend, forwardJSON, rejectCrossOrigin } from "@/lib/proxy-auth";

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 }); }
  const upstream = await authorizedBackend("/auth/change-password", { method: "POST", body: JSON.stringify(body) });
  const response = await forwardJSON(upstream);
  if (upstream?.ok) response.cookies.set("earnscore_access", "", {
    path: "/", maxAge: 0, httpOnly: true, sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
