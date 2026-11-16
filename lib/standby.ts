// 备用机：节点被墙时，把节点的域名切到备用机的 IP，备用机自己发现「有域名指向我了」，就变成那个节点。
// 不存状态：「哪些域名指向备用机」本身就是指令。备用机上的遥控程序（ops/scripts/standby-agent.py）
// 每隔一会儿来 /api/standby 问一次，这里按 DNS、Host、入站算出它该顶替谁。这个文件只放纯逻辑，方便单元测试。
//
// 配置是 Worker 的 secret STANDBYS，一个 JSON 数组，每台备用机一项：
//   [{"name":"备用 1","token":"一长串随机字符"}]
// name 就是这台备用机在 Marzban 里的节点名（它的 IP 从 Marzban 取，配置里不写 IP），token 是遥控程序来问时带的口令

import type { DnsRecord } from "./dns-switch";
import { switchable } from "./dns-switch";

export type StandbyConfig = { name: string; token: string };
// 备用机该变成的样子：只跑哪个入站（INBOUNDS）、入站监听的端口、客户端连的端口（不一样时备用机把后者转到前者）
export type StandbyRole = { inbound: string; port: number; public: number };

// 「名字 + 口令」列表的 secret（STANDBYS、PROBES 都是这个格式）：[{"name":"...","token":"..."}]
export function parseTokenList(raw: string | undefined | null, envName: string, nameHint: string): { items: StandbyConfig[] } | { error: string } {
  if (!raw || !raw.trim()) return { items: [] };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { error: `${envName} 不是合法的 JSON` };
  }
  if (!Array.isArray(v)) return { error: `${envName} 要是数组` };
  const items: StandbyConfig[] = [];
  for (const item of v) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const token = typeof item?.token === "string" ? item.token.trim() : "";
    if (!name) return { error: `${envName} 里有一项没写 name（${nameHint}）` };
    if (token.length < 24) return { error: `${envName} 里 ${name} 的 token 太短，至少 24 位` };
    if (items.some((s) => s.name === name)) return { error: `${envName} 里 ${name} 写了两次` };
    if (items.some((s) => s.token === token)) return { error: `${envName} 里两项用了同一个 token` };
    items.push({ name, token });
  }
  return { items };
}

export function parseStandbys(raw: string | undefined | null): { standbys: StandbyConfig[] } | { error: string } {
  const r = parseTokenList(raw, "STANDBYS", "Marzban 里的节点名");
  return "error" in r ? r : { standbys: r.items };
}

// 按口令找备用机。长度一样时逐个字符比完，不因为前几位对上就提前返回
export function findStandby(standbys: StandbyConfig[], given: string | null | undefined): StandbyConfig | null {
  if (!given) return null;
  let hit: StandbyConfig | null = null;
  for (const s of standbys) {
    if (s.token.length !== given.length) continue;
    let diff = 0;
    for (let i = 0; i < given.length; i++) diff |= s.token.charCodeAt(i) ^ given.charCodeAt(i);
    if (diff === 0) hit = s;
  }
  return hit;
}

type HostLike = { address: string; port?: number | null; is_disabled?: boolean };
type InboundLike = { tag: string; port: number | string };

// 指向 ip 的记录被哪些启用的 Host 用着 → 备用机该跑的入站。
// 没有 → 待命（role null）；几条记录都是同一个入站 → 那个入站；指向它的是两个不同的节点 → 报错，备用机保持原样
export function roleFor(
  ip: string,
  records: DnsRecord[],
  hosts: Record<string, HostLike[]>,
  inbounds: InboundLike[],
): { role: StandbyRole | null; names: string[] } | { error: string; names: string[] } {
  const names = records.filter((r) => switchable(r) && r.content === ip).map((r) => r.name.toLowerCase());
  const roles = new Map<string, StandbyRole>();
  for (const name of names)
    for (const [tag, list] of Object.entries(hosts))
      for (const h of list) {
        if (h.is_disabled || h.address.trim().toLowerCase() !== name) continue;
        const ib = inbounds.find((i) => i.tag === tag);
        const port = Number(ib?.port);
        if (!ib || !Number.isInteger(port) || port < 1 || port > 65535) return { error: `入站 ${tag} 的端口不对`, names };
        const pub = h.port ?? port;
        roles.set(`${tag}|${pub}`, { inbound: tag, port, public: pub });
      }
  if (roles.size > 1)
    return {
      error: `有几个不同的节点同时指向这台备用机（${[...roles.values()].map((r) => r.inbound).join("、")}），一台备用机同时只能顶替一个`,
      names,
    };
  return { role: roles.size ? [...roles.values()][0] : null, names };
}

// 备用机最近一次回报（操作日志里 standby.apply 那一行的说明）对不对得上它现在该做的事：
// 对上了 = 已就绪；对不上 = 还在等它来问（最多 15 秒，再加上重建容器的时间）；最近一次是失败 = 出错了
export type Readiness = "ready" | "waiting" | "error" | "unknown";
export function readiness(role: StandbyRole | null, report: { detail: string | null } | null): Readiness {
  if (!report?.detail) return "unknown";
  if (report.detail.startsWith("切换失败")) return "error";
  const applied = report.detail === "已待命" ? null : (/^已顶替 (.+)$/.exec(report.detail)?.[1] ?? undefined);
  if (applied === undefined) return "unknown";
  return applied === (role?.inbound ?? null) ? "ready" : "waiting";
}

// 「刚刚」「40 秒前」「3 分钟前」「2 小时前」「5 天前」
export function agoText(at: number, now: number, en = false): string {
  const s = Math.max(0, now - at);
  if (s < 10) return en ? "just now" : "刚刚";
  const [n, zh, enU] = s < 60 ? [s, "秒", "s"] : s < 3600 ? [Math.floor(s / 60), "分钟", "min"] : s < 86400 ? [Math.floor(s / 3600), "小时", "h"] : [Math.floor(s / 86400), "天", "d"];
  return en ? `${n}${enU} ago` : `${n} ${zh}前`;
}

// 页面上写的「正在顶替谁」
export function roleText(role: StandbyRole | null, en = false): string {
  if (!role) return en ? "standing by" : "待命";
  const fwd = role.public === role.port ? `${role.port}` : `${role.public} → ${role.port}`;
  return en ? `serving ${role.inbound} (${fwd})` : `顶替 ${role.inbound}（${fwd}）`;
}
