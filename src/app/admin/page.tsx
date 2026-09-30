import type { Metadata } from "next";
import { headers } from "next/headers";
import { AdminConsole } from "@/components/admin/admin-console";
import { AdminSignIn } from "@/components/admin/admin-sign-in";
import { checkAdmin } from "@/server/http/require-admin";

export const metadata: Metadata = { title: "Admin — Sneaker Drop" };

export default async function AdminPage() {
  const admin = await checkAdmin(await headers());
  if (!admin.ok) return <AdminSignIn />;
  return <AdminConsole email={admin.user.email} />;
}
