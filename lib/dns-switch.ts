// 「域名切换」页用到的纯逻辑（不碰网络，方便单元测试）。调 Cloudflare 的在 lib/cloudflare-dns.ts
//
// 节点地址用域名时，节点 IP 被墙后只要把域名的 A 记录改到备用 IP，客人不用更新订阅。
// 配置是 Worker 的 secret DNS_ZONES，一个 JSON 数组，每个域名一项，各带一个只能改这个域名 DNS 的 API token：
//   [{"zone":"example.com","token":"..."}]

export type DnsZoneConfig = { zone: string; token: string };
export type DnsRecord = { id: string; name: string; type: string; content: string; ttl: number; proxied: boolean };

const ZONE_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

// 读 DNS_ZONES。没配返回空数组；配错了返回 error，页面上提示，不抛错
export function parseDnsZones(raw: string | undefined | null): { zones: DnsZoneConfig[] } | { error: string } {
  if (!raw || !raw.trim()) return { zones: [] };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { error: "DNS_ZONES 不是合法的 JSON" };
  }
  if (!Array.isArray(v)) return { error: "DNS_ZONES 要是数组" };
  const zones: DnsZoneConfig[] = [];
  for (const item of v) {
    const zone = typeof item?.zone === "string" ? item.zone.trim().toLowerCase().replace(/\.$/, "") : "";
    const token = typeof item?.token === "string" ? item.token.trim() : "";
    if (!ZONE_RE.test(zone)) return { error: `DNS_ZONES 里有一项的 zone 不对：${zone || "(空)"}` };
    if (!token) return { error: `DNS_ZONES 里 ${zone} 没有 token` };
    if (zones.some((z) => z.zone === zone)) return { error: `DNS_ZONES 里 ${zone} 写了两次` };
    zones.push({ zone, token });
  }
  return { zones };
}

// 只认公网 IPv4：内网、本机、组播这些填进去客人肯定连不上，多半是手误
export function checkIPv4(raw: string): { ip: string } | { error: "format" | "private" } {
  const ip = raw.trim();
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return { error: "format" };
  const p = m.slice(1).map(Number);
  if (p.some((n, i) => n > 255 || String(n) !== m[i + 1])) return { error: "format" };
  const [a, b] = p;
  const reserved =
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19));
  return reserved ? { error: "private" } : { ip };
}

// 这条记录能不能在这里切：只管灰色云朵的 A 记录。橙色云朵走 Cloudflare 代理，改 IP 意义不同，不在这里动
export const switchable = (r: Pick<DnsRecord, "type" | "proxied">) => r.type === "A" && !r.proxied;

// 记录属不属于这个域名（防止拿别的域名的记录 id 来改）
export const inZone = (name: string, zone: string) => {
  const n = name.toLowerCase().replace(/\.$/, "");
  return n === zone || n.endsWith(`.${zone}`);
};

// 哪些 Host 的地址是这个域名：页面上写「客人通过哪些节点用到它」，停用的也列出来但标明
export function hostsUsing(name: string, hosts: Record<string, { remark: string; address: string; is_disabled?: boolean }[]>) {
  const n = name.toLowerCase();
  const out: { tag: string; remark: string; disabled: boolean }[] = [];
  for (const [tag, list] of Object.entries(hosts))
    for (const h of list) if (h.address.trim().toLowerCase() === n) out.push({ tag, remark: h.remark, disabled: !!h.is_disabled });
  return out;
}

// TTL 换成人话。Cloudflare 的 1 表示「自动」，灰色云朵时等于 300 秒
export function ttlText(ttl: number, en = false): string {
  const sec = ttl === 1 ? 300 : ttl;
  if (sec < 60) return en ? `${sec}s` : `${sec} 秒`;
  if (sec < 3600) return en ? `${Math.round(sec / 60)} min` : `${Math.round(sec / 60)} 分钟`;
  return en ? `${Math.round(sec / 3600)} h` : `${Math.round(sec / 3600)} 小时`;
}
