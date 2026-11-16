// 发给管理员的提醒邮件：节点掉线 / 恢复、客人点了「我已付款」、有新客人注册。都发到 site.contactEmail（客服邮箱，转到管理员自己的邮箱），
// 用和客人邮件同一个发信（lib/mail.ts），没配发信就不发
import { db } from "./env";
import { canSendMail, sendMail } from "./mail";
import { sendPush } from "./push";
import { listNodes, type MarzbanNode } from "./marzban";
import { planNodeAlerts, type AlertRow } from "./node-alerts";
import { site } from "../site.config";
import { newCustomerAlert } from "./welcome-mail";

export async function runNodeAlerts(now: number): Promise<{ down: number; sent: number }> {
  let nodes: MarzbanNode[] | null;
  try {
    nodes = await listNodes();
  } catch {
    nodes = null;
  }
  const { results: prev } = await db().prepare("SELECT node_id, name, message, down_since, alerted_at FROM node_alerts").all<AlertRow>();
  const plan = planNodeAlerts(nodes, prev, now, site.admin.url ?? null);
  const stmts = [
    ...plan.upsert.map((r) =>
      db()
        .prepare(
          `INSERT INTO node_alerts (node_id, name, message, down_since, alerted_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(node_id) DO UPDATE SET name = excluded.name, message = excluded.message, alerted_at = excluded.alerted_at`,
        )
        .bind(r.node_id, r.name, r.message, r.down_since, r.alerted_at),
    ),
    ...plan.remove.map((id) => db().prepare("DELETE FROM node_alerts WHERE node_id = ?").bind(id)),
  ];
  if (stmts.length) await db().batch(stmts);
  let sent = 0;
  if (canSendMail() && site.contactEmail) for (const m of plan.mails) if (await sendMail(site.contactEmail, m.subject, m.text)) sent++;
  // 掉线 / 恢复也推到微信（Server酱，没配就不推）
  for (const m of plan.mails) await sendPush(m.subject, m.text);
  return { down: plan.upsert.length, sent };
}

// 客人点了「我已付款」：提醒管理员去对账（自动开通成功的也要核对钱到没到）。发不出去不影响客人
export async function notifyClaimedOrder(o: { label: string; amount: string; method: string; payer: string | null; customer: string; activated: boolean }) {
  if (!canSendMail() || !site.contactEmail) return;
  await sendMail(
    site.contactEmail,
    `【${o.activated ? "待对账" : "要手动开通"}】${o.label} ${o.amount}`,
    `${o.customer} 说已经用${o.method}付了 ${o.amount}${o.payer ? `，付款人：${o.payer}` : ""}。\n\n` +
      (o.activated ? "已经自动开通了，请核对钱有没有到账。" : "自动开通没成功，要去后台手动开通。") +
      (site.admin.url ? `\n\n去后台看：${site.admin.url}/admin` : ""),
  );
}

// 有新客人注册：发一封提醒给管理员，方便马上加微信打招呼。发不出去不影响注册
export async function notifyNewCustomer(c: Parameters<typeof newCustomerAlert>[0]) {
  if (!canSendMail() || !site.contactEmail) return;
  const m = newCustomerAlert(c);
  await sendMail(site.contactEmail, m.subject, m.text);
}
