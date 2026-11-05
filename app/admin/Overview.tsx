import Link from "next/link";
import { db, nowSec } from "@/lib/env";
import { getSystem, listNodes, listUsers } from "@/lib/marzban";
import { formatMoney } from "@/lib/format";
import { monthStartBeijing } from "@/lib/admin-users";
import { site } from "@/site.config";
import { getT } from "@/lib/lang";

const DAY = 86400;

// 后台首页顶上的一排数字，每个都能点进对应的页面。Marzban 查不到时那几格显示「-」，不影响下面的订单
export default async function Overview({ pending }: { pending: number }) {
  const { t } = await getT();
  const now = nowSec();
  const month = Math.floor(monthStartBeijing(now * 1000).getTime() / 1000);
  const [sales, people] = await Promise.all([
    db()
      .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS sum FROM orders WHERE status = 'paid' AND COALESCE(paid_at, created_at) >= ?")
      .bind(month)
      .first<{ n: number; sum: number }>(),
    db()
      .prepare("SELECT COUNT(*) AS total, COALESCE(SUM(created_at >= ?), 0) AS fresh FROM customers WHERE deleted_at IS NULL")
      .bind(month)
      .first<{ total: number; fresh: number }>(),
  ]);

  let users = "-";
  let expiring = "-";
  let badNodes = "-";
  try {
    const [system, soon, nodes] = await Promise.all([getSystem(), listUsers({ offset: 0, limit: 200, status: "active", sort: "expire" }), listNodes()]);
    users = `${system.users_active} / ${system.total_user}`;
    expiring = String(soon.users.filter((u) => u.expire && u.expire - now < 7 * DAY).length);
    badNodes = String(nodes.filter((n) => n.status === "error").length);
  } catch {
    // Marzban 暂时连不上：这几格显示「-」
  }

  const tiles: { label: string; value: string; desc: string; href: string; warn?: boolean }[] = [
    {
      label: t("本月成交", "Sales this month"),
      value: `${site.currency}${formatMoney(sales?.sum ?? 0)}`,
      desc: t(`${sales?.n ?? 0} 单（北京时间本月）`, `${sales?.n ?? 0} orders (Beijing time)`),
      href: "/admin",
    },
    { label: t("待处理订单", "Orders to handle"), value: String(pending), desc: t("待付款、开通中、待对账", "Unpaid, provisioning, to reconcile"), href: "/admin", warn: pending > 0 },
    { label: t("客人", "Customers"), value: String(people?.total ?? 0), desc: t(`本月新注册 ${people?.fresh ?? 0}`, `${people?.fresh ?? 0} new this month`), href: "/admin/customers" },
    { label: t("在用 / 全部订阅", "Active / all subscriptions"), value: users, desc: t("Marzban 上的用户数", "Users on Marzban"), href: "/admin/users" },
    {
      label: t("7 天内到期", "Expiring in 7 days"),
      value: expiring,
      desc: t("提醒客人续费", "Remind them to renew"),
      href: "/admin/users?status=active&sort=expire",
      warn: expiring !== "-" && expiring !== "0",
    },
    { label: t("出错的节点", "Nodes with errors"), value: badNodes, desc: t("点进去重连", "Open to reconnect"), href: "/admin/nodes", warn: badNodes !== "-" && badNodes !== "0" },
  ];

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="overview">
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className={`rounded-box bg-base-100 p-3 shadow-sm transition hover:shadow-md ${t.warn ? "border border-warning" : ""}`}>
          <div className="text-xs text-base-content/60">{t.label}</div>
          <div className={`text-xl font-bold ${t.warn ? "text-warning" : ""}`}>{t.value}</div>
          <div className="text-xs text-base-content/50">{t.desc}</div>
        </Link>
      ))}
    </div>
  );
}
