import { NextResponse } from "next/server";
import { postBackend } from "@/lib/api";
import { rejectCrossOrigin } from "@/lib/proxy-auth";

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  let payload: { email?: string; full_name?: string; password?: string };
  try { payload = await req.json(); } catch { return NextResponse.json({ detail: "Invalid JSON" }, { status: 400 }); }
  const created = await postBackend("/auth/register", payload);
  if (created.status !== 201) return NextResponse.json({ detail: created.data.detail || "Registration failed" }, { status: created.status });
  const logged = await postBackend("/auth/login", { email: payload.email, password: payload.password });
  if (logged.status !== 200) return NextResponse.json({ detail: "Account created. Please sign in." }, { status: 503 });
  const response = NextResponse.json({ role: "worker" }, { status: 201 });
  response.cookies.set("earnscore_access", logged.data.access_token, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: logged.data.expires_in,
  });
  return response;
}
