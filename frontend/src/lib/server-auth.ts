import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Overview, Role, User } from "@/lib/types";

const base = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

async function authFetch(path: string): Promise<Response | null> {
  const token = (await cookies()).get("earnscore_access")?.value;
  if (!token) return null;
  try {
    return await fetch(`${base}/api/v1${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

export async function getSession(): Promise<User | null> {
  const res = await authFetch("/auth/me");
  return res?.ok ? (await res.json()) as User : null;
}

export async function requireRole(role: Role): Promise<User> {
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(`/${user.role}`);
  return user;
}

export async function getOverview(role: Role): Promise<Overview | null> {
  const res = await authFetch(`/${role}/overview`);
  return res?.ok ? (await res.json()) as Overview : null;
}

export async function getAdminUsers(): Promise<User[]> {
  const res = await authFetch("/admin/users");
  if (!res?.ok) return [];
  return (await res.json()) as User[];
}
