import { redirect } from "next/navigation";
import { currentAdmin, requireAccess } from "@/lib/admin";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  await requireAccess();
  if (await currentAdmin()) redirect("/admin");
  return <LoginForm />;
}
