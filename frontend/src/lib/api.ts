const backend = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";
export async function postBackend(endpoint: string, body: unknown) {
  try {
    const res = await fetch(`${backend}/api/v1${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } catch {
    return { status: 503, data: { detail: "Backend unavailable. Start FastAPI on port 8000." } };
  }
}
