import { NextResponse } from "next/server";
import { authorizedBackend, rejectCrossOrigin } from "@/lib/proxy-auth";

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  // Revoke the token in the backend, then clear the cookie even if it expired.
  const result = await authorizedBackend("/auth/logout", { method: "POST" });
  const response = NextResponse.json({ ok: true, server_revoked: result?.ok ?? false });
  response.cookies.set("earnscore_access", "", {
    path: "/", maxAge: 0, httpOnly: true, sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
