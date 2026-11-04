// 节点掉线提醒的纯逻辑（不碰数据库和网络，方便单元测试）。跑的地方在 lib/admin-alerts.ts

// 连着掉线这么久才发，闪断一下不打扰
export const DOWN_GRACE = 5 * 60;
const PANEL_ID = 0;

export type AlertRow = { node_id: number; name: string; message: string | null; down_since: number; alerted_at: number | null };
type Mail = { subject: string; text: string };
export type AlertPlan = { upsert: AlertRow[]; remove: number[]; mails: Mail[] };

const minutes = (sec: number) => (sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} 分钟` : `${Math.floor(sec / 3600)} 小时 ${Math.round((sec % 3600) / 60)} 分钟`);

// 纯逻辑：这次查到的节点（null 表示面板连不上）和上次记着的掉线节点比，决定要记什么、删什么、发哪几封
// adminUrl：后台网址，邮件里放链接；没有就不放
export function planNodeAlerts(
  nodes: { id: number; name: string; status: string; message: string | null }[] | null,
  prev: AlertRow[],
  now: number,
  adminUrl: string | null,
): AlertPlan {
  const link = adminUrl ? `\n\n去后台看：${adminUrl}/admin/nodes` : "";
  const plan: AlertPlan = { upsert: [], remove: [], mails: [] };
  const before = new Map(prev.map((r) => [r.node_id, r]));
  // 面板连不上时节点状态都不知道，只管面板这一行，节点的记录先不动
  const current: { id: number; name: string; down: boolean; message: string | null }[] =
    nodes === null
      ? [{ id: PANEL_ID, name: "面板（Marzban）", down: true, message: "后台连不上 Marzban 面板" }]
      : [
          { id: PANEL_ID, name: "面板（Marzban）", down: false, message: null },
          // 停用的节点是管理员自己关的，不算掉线
          ...nodes.filter((n) => n.status !== "disabled").map((n) => ({ id: n.id, name: n.name, down: n.status === "error" || n.status === "connecting", message: n.message })),
        ];
  const seen = new Set(current.map((c) => c.id));

  for (const c of current) {
    const was = before.get(c.id);
    if (c.down) {
      const row: AlertRow = was ? { ...was, name: c.name, message: c.message } : { node_id: c.id, name: c.name, message: c.message, down_since: now, alerted_at: null };
      if (!row.alerted_at && now - row.down_since >= DOWN_GRACE) {
        row.alerted_at = now;
        plan.mails.push({
          subject: `【掉线】${c.name}`,
          text: `${c.name} 从 ${minutes(now - row.down_since)}前开始连不上。${c.message ? `\n\n出错原因：${c.message}` : ""}${link}`,
        });
      }
      plan.upsert.push(row);
    } else if (was) {
      plan.remove.push(c.id);
      if (was.alerted_at) plan.mails.push({ subject: `【已恢复】${c.name}`, text: `${c.name} 已经恢复，前后掉线大约 ${minutes(now - was.down_since)}。${link}` });
    }
  }
  // 节点被删了：记录清掉，不发信
  if (nodes !== null) for (const r of prev) if (!seen.has(r.node_id)) plan.remove.push(r.node_id);
  return plan;
}
