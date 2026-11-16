// 国内检测机（ops/scripts/block-probe.py）每 5 分钟来一次：带上这段时间的变化（某个节点连不上了 / 恢复了），
// 这里发邮件、记操作日志，再把现在要检测的地址列表回给它。带 Authorization: Bearer <token>，对不上一律 404。
// 「最后一次来报告的时间」记在操作日志里每台检测机一行（action = probe.heartbeat，原地更新，日志页不显示）
import { logAdmin } from "@/lib/admin";
import { db, nowSec } from "@/lib/env";
import { env } from "@/lib/env";
import { canSendMail, sendMail } from "@/lib/mail";
import { sendPush } from "@/lib/push";
import { parseEvents, parseProbes, probeMail, probeTargets } from "@/lib/probe";
import { findStandby } from "@/lib/standby";
import { lineState } from "@/lib/standby-state";
import { site } from "@/site.config";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request) {
  const cfg = parseProbes((env() as unknown as { PROBES?: string }).PROBES);
  if ("error" in cfg || cfg.probes.length === 0) return notFound();
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  const me = findStandby(cfg.probes, token);
  if (!me) return notFound();

  let body: { events?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // 没带 body 也行
  }
  const events = parseEvents(body.events);
  if (!events) return Response.json({ error: "events 格式不对" }, { status: 400 });
  const now = nowSec();
  const note = typeof body.note === "string" ? body.note.slice(0, 200) : "";

  // 心跳：每台检测机一行，原地更新时间和最近一次的情况
  const hb = await db().prepare("SELECT id FROM admin_logs WHERE action = 'probe.heartbeat' AND target = ? ORDER BY id DESC LIMIT 1").bind(me.name).first<{ id: number }>();
  if (hb) await db().prepare("UPDATE admin_logs SET created_at = ?, detail = ? WHERE id = ?").bind(now, note || null, hb.id).run();
  else await logAdmin({ id: null, email: `检测机 ${me.name}` }, "probe.heartbeat", me.name, note || undefined);

  if (events.length) {
    for (const e of events)
      await logAdmin({ id: null, email: `检测机 ${me.name}` }, e.state === "down" ? "probe.down" : "probe.up", e.label, `${e.host}:${e.port}${e.detail ? `｜${e.detail}` : ""}`);
    const mail = probeMail(me.name, events, now, site.admin.url ?? null);
    if (mail && canSendMail() && site.contactEmail) await sendMail(site.contactEmail, mail.subject, mail.text);
    // 同时推到微信（Server酱，没配就不推）：被墙往往在晚上，邮件不一定马上看到
    if (mail) await sendPush(mail.subject, mail.text);
  }

  try {
    const s = await lineState();
    return Response.json({ targets: probeTargets(s.records, s.hosts, s.inbounds, s.nodes), interval: 300 });
  } catch (e) {
    // 查不到就让检测机继续用上次的列表。还是回 200：上面的变化已经收到、邮件已经发了，检测机不用重发
    return Response.json({ error: `查询失败：${e instanceof Error ? e.message : String(e)}`, interval: 300 });
  }
}
