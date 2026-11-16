// 备用机上的遥控程序（ops/scripts/standby-agent.py）每隔一会儿来这里问「我现在该顶替谁」。
// 带 Authorization: Bearer <token>，token 对不上一律 404。回答由 DNS 现算（见 lib/standby.ts），这里不存状态。
// 遥控程序换了角色（或换失败）时在请求里带上 report，记进后台操作日志
import { logAdmin } from "@/lib/admin";
import { findStandby, roleFor, roleText } from "@/lib/standby";
import { lineState, standbyConfig, standbyIp } from "@/lib/standby-state";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request) {
  const cfg = standbyConfig();
  if ("error" in cfg || cfg.standbys.length === 0) return notFound();
  const token = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  const me = findStandby(cfg.standbys, token);
  if (!me) return notFound();

  let body: { report?: { applied?: unknown; error?: unknown } } = {};
  try {
    body = await req.json();
  } catch {
    // 没带 body 也行
  }
  const rep = body.report;
  if (rep && typeof rep === "object") {
    const err = typeof rep.error === "string" ? rep.error.slice(0, 300) : "";
    const applied = typeof rep.applied === "string" ? rep.applied.slice(0, 100) : null;
    await logAdmin({ id: null, email: `备用机 ${me.name}` }, "standby.apply", me.name, err ? `切换失败：${err}` : applied ? `已顶替 ${applied}` : "已待命");
  }

  let state;
  try {
    state = await lineState();
  } catch (e) {
    // 查不到就让它保持原样，下次再问
    return Response.json({ error: `查询失败：${e instanceof Error ? e.message : String(e)}` }, { status: 503 });
  }
  const ip = standbyIp(me.name, state.nodes);
  if (!ip) return Response.json({ error: `面板里没有叫「${me.name}」、地址是 IP 的节点，先在面板里加上这台备用机` }, { status: 409 });
  const r = roleFor(ip, state.records, state.hosts, state.inbounds);
  if ("error" in r) return Response.json({ error: r.error, names: r.names }, { status: 409 });
  return Response.json({ role: r.role, names: r.names, text: roleText(r.role) });
}
