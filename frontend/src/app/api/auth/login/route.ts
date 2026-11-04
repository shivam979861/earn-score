import { NextResponse } from "next/server";
import { postBackend } from "@/lib/api";
import { rejectCrossOrigin } from "@/lib/proxy-auth";

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  let payload: unknown;
  try { payload = await req.json(); } catch { return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 }); }
  const { status, data } = await postBackend("/auth/login", payload);
  if (status !== 200) return NextResponse.json({ detail: data.detail || "Login failed" }, { status });
  const response = NextResponse.json({ role: data.role });
  response.cookies.set("earnscore_access", data.access_token, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: data.expires_in,
  });
  return response;
}
