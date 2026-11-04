import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** BFF cookie never reaches browser JS. Only server code forwards it as Bearer. */
export async function authorizedBackend(path: string, init: RequestInit = {}) {
  const token = (await cookies()).get("earnscore_access")?.value;
  if (!token) return Response.json({ detail: "Not authenticated" }, { status: 401 });
  try {
    return await fetch(`${backend}/api/v1${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return Response.json({ detail: "Backend unavailable" }, { status: 503 });
  }
}

/** SameSite=Strict plus an Origin check for any state-changing Next.js BFF call. */
export function rejectCrossOrigin(req: Request): NextResponse | null {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_ORIGIN ?? new URL(req.url).origin;
  if (origin !== expected) {
    return NextResponse.json({ detail: "Invalid request origin" }, { status: 403 });
  }
  return null;
}

export async function forwardJSON(response: Response | null) {
  if (!response) return NextResponse.json({ detail: "Not authenticated or backend unavailable" }, { status: 503 });
  const body = await response.json().catch(() => ({}));
  return NextResponse.json(body, { status: response.status });
}
