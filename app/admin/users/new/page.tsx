import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { nowSec } from "@/lib/env";
import { toBeijingInput } from "@/lib/admin-users";
import AdminHeader from "../../AdminHeader";
import { adminCreateUser } from "../../actions";
import UserForm from "../UserForm";

export const dynamic = "force-dynamic";

// 手动新建 Marzban 用户（比如线下收款、送朋友试用）。默认 30 天、ip=2
export default async function NewUserPage() {
  const admin = await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/users" className="link link-hover text-sm text-base-content/60">
        ← 用户列表
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold">新建用户</h1>
      <p className="mb-4 text-sm text-base-content/60">只开 VLESS，自动勾上全部 VLESS 入站。</p>
      <UserForm action={adminCreateUser} defaults={{ dataGB: "", reset: "no_reset", expire: toBeijingInput(nowSec() + 30 * 86400), note: "ip=2", status: "active" }} />
    </div>
  );
}
