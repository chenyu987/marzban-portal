// 管理后台确认、取消客人的转账订单。逻辑和命令行 scripts/orders.mjs 的 confirm / cancel 一样：
// 先把单占成「开通中」（不会被确认两次，客人也取消不了）→ 在 Marzban 开通或续期 → 记成已付款（触发推荐奖励）。
// Marzban 确认没改就把单退回「等付款」；可能改了就停在「开通中」，交给管理员去面板核对
import "server-only";
import { db, nowSec } from "./env";
import { findPlan } from "./plans";
import { formatExpire } from "./format";
import { provisionTarget } from "./orders";
import { site } from "../site.config";

export type AdminResult = { ok: string } | { error: string };

type OrderRow = {
  id: number;
  customer_id: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
};

export async function confirmTransferOrder(orderId: number): Promise<AdminResult> {
  const o = await db()
    .prepare("SELECT id, customer_id, method, status, plan_id, marzban_username FROM orders WHERE id = ?")
    .bind(orderId)
    .first<OrderRow>();
  if (!o) return { error: `没有订单 ${orderId}` };
  if (o.method !== "transfer" || o.status !== "pending") return { error: `订单 ${orderId} 现在不是等付款的转账单，刷新看看` };
  const plan = o.plan_id ? findPlan(site.plans, o.plan_id) : undefined;
  if (!plan) return { error: `套餐 ${o.plan_id} 已经不在 site.config.ts 里了，取消这张单，用命令行 payment:record 处理` };

  const { results } = await db()
    .prepare("SELECT marzban_username FROM subscriptions WHERE customer_id = ? ORDER BY id")
    .bind(o.customer_id)
    .all<{ marzban_username: string }>();
  const subs = results.map((r) => r.marzban_username);
  const target = o.marzban_username ?? "new";
  if (target !== "new" && !subs.includes(target)) return { error: `要续期的 ${target} 已经不在这位客人名下了，取消这张单再处理` };

  const now = nowSec();
  const claim = await db()
    .prepare("UPDATE orders SET status = 'processing' WHERE id = ? AND status = 'pending'")
    .bind(orderId)
    .run();
  if (claim.meta.changes !== 1) return { error: "单的状态刚变了（客人可能取消了），刷新看看" };
  const revert = () =>
    db().prepare("UPDATE orders SET status = 'pending' WHERE id = ? AND status = 'processing'").bind(orderId).run();

  let result;
  try {
    result = await provisionTarget(o.customer_id, subs, target, plan, now);
  } catch (e) {
    await revert();
    return { error: `连 Marzban 出错，单退回「等付款」，可以再点一次：${e instanceof Error ? e.message : e}` };
  }
  if ("error" in result) {
    await revert();
    return { error: `${result.error}（单退回「等付款」）` };
  }
  if (result.kind === "retry") {
    await revert();
    return { error: `Marzban 没有改动，单退回「等付款」，可以再点一次：${result.reason}` };
  }
  if (result.kind === "stuck") {
    return {
      error:
        `${result.reason}。Marzban 可能改了也可能没改，单停在「开通中」。先去面板看 ${result.username}，` +
        `改好了就用命令行 npm run orders -- confirm ${orderId} --done ${result.username} --remote，没改就 --again`,
    };
  }

  await db().batch([
    ...(target === "new"
      ? [
          db()
            .prepare("INSERT INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?)")
            .bind(o.customer_id, result.username, now),
        ]
      : []),
    db()
      .prepare("UPDATE orders SET status = 'paid', paid_at = ?, marzban_username = ? WHERE id = ?")
      .bind(now, result.username, orderId),
  ]);
  return {
    ok:
      `订单 ${orderId} 已确认：${target === "new" ? "新开" : "续期"} ${result.username}，到期 ${formatExpire(result.expire)}` +
      (result.warning ? `。⚠️ ${result.warning}，去面板手动把流量清零` : ""),
  };
}

// 取消等付款的单，下单时抵扣的余额退回
export async function cancelPendingOrder(orderId: number): Promise<AdminResult> {
  const r = await db().prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").bind(orderId).run();
  if (r.meta.changes !== 1) return { error: `订单 ${orderId} 已经不是「等付款」了，刷新看看` };
  await db().prepare("DELETE FROM balance_entries WHERE order_id = ? AND kind = 'purchase'").bind(orderId).run();
  return { ok: `订单 ${orderId} 已取消` };
}
