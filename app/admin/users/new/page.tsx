import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import AdminHeader from "../../AdminHeader";
import { adminCreateUser } from "../../actions";
import UserForm from "../UserForm";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

// 手动新建 Marzban 用户（比如线下收款、送朋友试用）。默认 30 天、ip=2
export default async function NewUserPage({ searchParams }: { searchParams: Promise<{ customer?: string | string[] }> }) {
  const admin = await requireAdmin();
  const { customer } = await searchParams;
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/users" className="link link-hover text-sm text-base-content/60">
        ← {t("订阅列表", "Subscriptions")}
      </Link>
      <h1 className="mt-2 mb-4 text-2xl font-bold">{t("新建订阅", "New subscription")}</h1>
      <p className="mb-4 text-sm text-base-content/60">{t("只开 VLESS，自动勾上全部 VLESS 入站。", "VLESS only; all VLESS inbounds are enabled automatically.")}</p>
      <UserForm action={adminCreateUser} defaults={{ dataGB: "", reset: "month", expire: "", note: "ip=2", status: "active", customer: typeof customer === "string" ? customer : "" }} />
    </div>
  );
}
