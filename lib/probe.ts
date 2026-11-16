// 被墙检测：国内的检测机（ops/scripts/block-probe.py，放在维护人家里 / 办公室的电脑上）每 5 分钟连一遍各节点域名，
// 连续几次连不上就报给 /api/probe，这里发邮件提醒管理员。只放纯逻辑，方便单元测试。
//
// 配置是 Worker 的 secret PROBES，格式和 STANDBYS 一样：[{"name":"家里-联通","token":"一长串随机字符"}]
// name 是检测机的名字（写上运营商，邮件里看得出是哪条线路发现的）

import { parseTokenList, type StandbyConfig } from "./standby";
import { checkIPv4, switchable, type DnsRecord } from "./dns-switch";

export const parseProbes = (raw: string | undefined | null): { probes: StandbyConfig[] } | { error: string } => {
  const r = parseTokenList(raw, "PROBES", "检测机的名字，比如 家里-联通");
  return "error" in r ? r : { probes: r.items };
};

// 检测机要连的地址：灰色云朵、并且有启用的 Host 在用的节点域名。端口是客户端实际连的端口（Host 的端口，没写就是入站的）
export type ProbeTarget = { host: string; port: number; label: string };
export function probeTargets(
  records: DnsRecord[],
  hosts: Record<string, { address: string; port?: number | null; is_disabled?: boolean }[]>,
  inbounds: { tag: string; port: number | string }[],
  nodes: { name: string; address: string }[],
): ProbeTarget[] {
  const out = new Map<string, ProbeTarget>();
  for (const r of records) {
    if (!switchable(r)) continue;
    const name = r.name.toLowerCase();
    for (const [tag, list] of Object.entries(hosts))
      for (const h of list) {
        if (h.is_disabled || h.address.trim().toLowerCase() !== name) continue;
        const port = h.port ?? Number(inbounds.find((i) => i.tag === tag)?.port);
        if (!Number.isInteger(port) || port < 1 || port > 65535) continue;
        const node = "ip" in checkIPv4(r.content) ? nodes.find((n) => n.address === r.content)?.name : undefined;
        out.set(`${name}:${port}`, { host: name, port, label: node ?? name });
      }
  }
  // 按字符编码排，不跟运行环境的语言设置走
  return [...out.values()].sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
}

// 检测机报上来的变化：连不上了（down）/ 恢复了（up）
export type ProbeEvent = { host: string; port: number; label: string; state: "down" | "up"; since: number; detail: string };

export function parseEvents(v: unknown): ProbeEvent[] | null {
  if (v === undefined) return [];
  if (!Array.isArray(v) || v.length > 30) return null;
  const out: ProbeEvent[] = [];
  for (const e of v) {
    if (!e || typeof e !== "object") return null;
    const { host, port, label, state, since, detail } = e as Record<string, unknown>;
    if (typeof host !== "string" || !/^[a-z0-9.-]{1,253}$/i.test(host)) return null;
    if (typeof port !== "number" || !Number.isInteger(port) || port < 1 || port > 65535) return null;
    if (state !== "down" && state !== "up") return null;
    out.push({
      host: host.toLowerCase(),
      port,
      label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : host,
      state,
      since: typeof since === "number" && since > 0 ? Math.floor(since) : 0,
      detail: typeof detail === "string" ? detail.slice(0, 300) : "",
    });
  }
  return out;
}

const minutes = (sec: number) => (sec < 3600 ? `${Math.max(1, Math.round(sec / 60))} 分钟` : `${Math.floor(sec / 3600)} 小时 ${Math.round((sec % 3600) / 60)} 分钟`);

// 一次报告里的变化合成一封邮件
export function probeMail(probe: string, events: ProbeEvent[], now: number, adminUrl: string | null): { subject: string; text: string } | null {
  if (!events.length) return null;
  const down = events.filter((e) => e.state === "down");
  const up = events.filter((e) => e.state === "up");
  const names = (list: ProbeEvent[]) => list.map((e) => e.label).join("、");
  const subject = down.length ? `【疑似被墙】${names(down)}（${probe}）` : `【已恢复】${names(up)}（${probe}）`;
  const lines: string[] = [];
  for (const e of down)
    lines.push(
      `${e.label}（${e.host}:${e.port}）：从检测机「${probe}」连续连不上${e.since ? `，从 ${minutes(now - e.since)}前开始` : ""}。同一时间国内网站和海外测速机都能连上，所以很可能是这个 IP 被墙了。${e.detail ? `\n  ${e.detail}` : ""}`,
    );
  for (const e of up) lines.push(`${e.label}（${e.host}:${e.port}）：从「${probe}」又能连上了${e.since ? `，前后大约 ${minutes(now - e.since)}` : ""}。`);
  if (down.length)
    lines.push(
      "怎么处理：先看另一台检测机（不同运营商）有没有也报。确认被墙后，去后台「域名」页，在这个节点的记录后面点「切到备用机」，客人不用更新订阅。",
    );
  if (adminUrl) lines.push(`去后台：${adminUrl}/admin/dns`);
  return { subject, text: lines.join("\n\n") };
}

// 检测机多久没报告算「停了」：每 5 分钟报一次，20 分钟没消息就提示
export const PROBE_STALE = 20 * 60;
