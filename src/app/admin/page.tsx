import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/adminSession";

export default async function AdminIndexPage() {
  const admin = await getCurrentAdmin();

  redirect(admin ? "/admin/reports" : "/admin/login");
}

