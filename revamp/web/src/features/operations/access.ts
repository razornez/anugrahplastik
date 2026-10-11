import { redirect } from "next/navigation";
import { getSession, type SessionUser } from "@/lib/auth/session";

export function canUseOperations(user: SessionUser) {
  return user.role === "admin" || user.role === "sales";
}

export async function requireOperationsAccess() {
  const user = await getSession();
  if (!user || !canUseOperations(user)) redirect("/admin");
  return user;
}

export async function requireOperationsOwner() {
  const user = await getSession();
  if (!user || user.role !== "admin") redirect("/admin");
  return user;
}
