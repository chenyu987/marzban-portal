// 备用机用到的现取数据：所有节点域名的 A 记录、Marzban 的 Host / 入站 / 节点。只在服务器端用
import { env } from "./env";
import { dnsZones, listARecords } from "./cloudflare-dns";
import { getHosts, listInbounds, listNodes, type Inbound, type MarzbanNode, type ProxyHost } from "./marzban";
import { checkIPv4, type DnsRecord } from "./dns-switch";
import { parseStandbys } from "./standby";

export const standbyConfig = () => parseStandbys((env() as unknown as { STANDBYS?: string }).STANDBYS);

export type LineState = { records: DnsRecord[]; hosts: Record<string, ProxyHost[]>; inbounds: Inbound[]; nodes: MarzbanNode[] };

// 一次取齐。任何一样取不到就抛错：备用机宁可保持原样，也不能因为一次查询失败就当成「没人指向我」去待命
export async function lineState(): Promise<LineState> {
  const cfg = dnsZones();
  if ("error" in cfg) throw new Error(cfg.error);
  const [records, hosts, ib, nodes] = await Promise.all([
    Promise.all(cfg.zones.map((z) => listARecords(z))).then((r) => r.flat()),
    getHosts(),
    listInbounds(),
    listNodes(),
  ]);
  return { records, hosts, inbounds: Object.values(ib).flat(), nodes };
}

// 备用机的 IP：它在 Marzban 里登记的节点地址（必须是 IP）
export function standbyIp(name: string, nodes: MarzbanNode[]): string | null {
  const n = nodes.find((x) => x.name === name);
  return n && "ip" in checkIPv4(n.address) ? n.address : null;
}
