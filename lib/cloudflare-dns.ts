// 调 Cloudflare 的 DNS 接口：列出域名下的 A 记录、改一条记录的 IP。只在服务器端用，token 不会进浏览器
//
// 环境变量：
//   DNS_ZONES    secret，格式见 lib/dns-switch.ts。线上用 `npx wrangler secret put DNS_ZONES`
//   CF_API_BASE  可选，本地开发指向假 Marzban 里的假 Cloudflare（dev/mock-marzban.mjs）
import { env } from "./env";
import { parseDnsZones, type DnsRecord, type DnsZoneConfig } from "./dns-switch";

type DnsEnv = { DNS_ZONES?: string; CF_API_BASE?: string };
const dnsEnv = () => env() as unknown as DnsEnv;
const base = () => (dnsEnv().CF_API_BASE || "https://api.cloudflare.com/client/v4").replace(/\/$/, "");

export const dnsZones = () => parseDnsZones(dnsEnv().DNS_ZONES);

export class CloudflareError extends Error {}

async function cf<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  let data: { success?: boolean; errors?: { code?: number; message?: string }[]; result?: T } = {};
  try {
    data = await res.json();
  } catch {
    // 下面按 HTTP 状态报错
  }
  if (!res.ok || !data.success) {
    const msg = data.errors?.map((e) => e.message).filter(Boolean).join("；") || `HTTP ${res.status}`;
    throw new CloudflareError(msg);
  }
  return data.result as T;
}

// 域名的 zone id。token 只给了这一个域名的权限，按名字查就只会查到它
async function zoneId(z: DnsZoneConfig): Promise<string> {
  const list = await cf<{ id: string; name: string }[]>(z.token, "GET", `/zones?${new URLSearchParams({ name: z.zone })}`);
  const hit = list.find((x) => x.name === z.zone);
  if (!hit) throw new CloudflareError(`token 看不到 ${z.zone}，检查 token 的权限`);
  return hit.id;
}

const pick = (r: DnsRecord): DnsRecord => ({ id: r.id, name: r.name, type: r.type, content: r.content, ttl: r.ttl, proxied: !!r.proxied });

// 域名下全部 A 记录（一个域名不会有上百条节点记录，取一页就够）
export async function listARecords(z: DnsZoneConfig): Promise<DnsRecord[]> {
  const id = await zoneId(z);
  const list = await cf<DnsRecord[]>(z.token, "GET", `/zones/${id}/dns_records?${new URLSearchParams({ type: "A", per_page: "100" })}`);
  return list.map(pick).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getRecord(z: DnsZoneConfig, recordId: string): Promise<DnsRecord> {
  const id = await zoneId(z);
  return pick(await cf<DnsRecord>(z.token, "GET", `/zones/${id}/dns_records/${encodeURIComponent(recordId)}`));
}

// 只改 IP，名字、TTL、云朵状态都不动
export async function setRecordIp(z: DnsZoneConfig, recordId: string, ip: string): Promise<DnsRecord> {
  const id = await zoneId(z);
  return pick(await cf<DnsRecord>(z.token, "PATCH", `/zones/${id}/dns_records/${encodeURIComponent(recordId)}`, { content: ip }));
}
