import { NextResponse } from "next/server";
import { authorizedBackend, forwardJSON, rejectCrossOrigin } from "@/lib/proxy-auth";

/** Worker-only server-side proxy: never expose the JWT to browser JavaScript. */
export async function GET() {
  return forwardJSON(await authorizedBackend("/worker/uploads"));
}

export async function POST(req: Request) {
  const denied = rejectCrossOrigin(req);
  if (denied) return denied;
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > 2 * 1024 * 1024 + 20_000) {
    return NextResponse.json({ detail: "CSV is too large (2 MB maximum)." }, { status: 413 });
  }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ detail: "Invalid CSV upload." }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0 || file.size > 2 * 1024 * 1024 ||
    !file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ detail: "Select a nonempty .csv file up to 2 MB." }, { status: 400 });
  }
  if (typeof form.get("mapping") !== "string") {
    return NextResponse.json({ detail: "Please confirm the column mapping." }, { status: 400 });
  }
  const serverResponse = await authorizedBackend("/worker/uploads", { method: "POST", body: form });
  return forwardJSON(serverResponse);
}
