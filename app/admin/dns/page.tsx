import { requireAdmin } from "@/lib/admin";
import { getHosts, listInbounds, listNodes, type Inbound, type MarzbanNode, type ProxyHost } from "@/lib/marzban";
import { dnsZones, listARecords } from "@/lib/cloudflare-dns";
import { checkIPv4, hostsUsing, switchable, ttlText, type DnsRecord } from "@/lib/dns-switch";
import { agoText, readiness, roleFor, roleText, type Readiness } from "@/lib/standby";
import { standbyConfig, standbyIp } from "@/lib/standby-state";
import { nodeStatusLabel } from "@/lib/admin-users";
import { db, env, nowSec } from "@/lib/env";
import { parseProbes, PROBE_STALE } from "@/lib/probe";
import { getT } from "@/lib/lang";
import AdminHeader from "../AdminHeader";
import { SwitchForm } from "./DnsControls";
import AutoRefresh from "./AutoRefresh";

export const dynamic = "force-dynamic";

// 域名切换：节点地址用域名时，IP 被墙了在这里把域名指到备用 IP，客人不用更新订阅。
// 每个配置了的域名一张卡片，列出灰色云朵的 A 记录：指向哪个 IP、那个 IP 是面板里的哪个节点、哪些 Host 在用这个域名
export default async function DnsPage() {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const en = lang === "en";
  const cfg = dnsZones();

  let nodes: MarzbanNode[] = [];
  let hosts: Record<string, ProxyHost[]> = {};
  let inbounds: Inbound[] = [];
  let marzbanError = "";
  try {
    const [n, h, ib] = await Promise.all([listNodes(), getHosts(), listInbounds()]);
    nodes = n;
    hosts = h;
    inbounds = Object.values(ib).flat();
  } catch (e) {
    marzbanError = e instanceof Error ? e.message : String(e);
  }
  const sbCfg = standbyConfig();
  const standbys = "error" in sbCfg ? [] : sbCfg.standbys.map((s) => ({ name: s.name, ip: standbyIp(s.name, nodes), node: nodes.find((n) => n.name === s.name) }));
  const standbyIps = new Set(standbys.map((s) => s.ip).filter(Boolean));
  // 面板里登记过的节点 IP，切换时可以直接选（备用机标出来）；也用来认出记录现在指向哪个节点
  const nodeByIp = new Map(nodes.filter((n) => "ip" in checkIPv4(n.address)).map((n) => [n.address, n.name]));
  const choices = [...nodeByIp].map(([ip, name]) => ({ ip, name, standby: standbyIps.has(ip) }));

  const zones =
    "error" in cfg
      ? []
      : await Promise.all(
          cfg.zones.map(async (z) => {
            try {
              return { zone: z.zone, records: await listARecords(z), error: "" };
            } catch (e) {
              return { zone: z.zone, records: [] as DnsRecord[], error: e instanceof Error ? e.message : String(e) };
            }
          }),
        );

  // 每台备用机：按现在的 DNS 算它应该是什么，再和它最近一次的回报（操作日志 standby.apply）比
  const now = nowSec();
  const standbyRows = await Promise.all(
    standbys.map(async (s) => {
      const r = s.ip ? roleFor(s.ip, zones.flatMap((z) => z.records), hosts, inbounds) : null;
      const report = await db()
        .prepare("SELECT detail, created_at AS at FROM admin_logs WHERE action = 'standby.apply' AND target = ? ORDER BY id DESC LIMIT 1")
        .bind(s.name)
        .first<{ detail: string | null; at: number }>();
      const ready: Readiness = r && !("error" in r) ? readiness(r.role, report) : "unknown";
      return { s, r, st: s.node ? nodeStatusLabel(s.node.status, lang) : null, report, ready };
    }),
  );

  // 国内检测机：最后一次来报告的时间和当时的情况（probe.heartbeat 那一行），最近几次「连不上 / 恢复」
  const prCfg = parseProbes((env() as unknown as { PROBES?: string }).PROBES);
  const probeRows = await Promise.all(
    ("error" in prCfg ? [] : prCfg.probes).map(async (p) => ({
      name: p.name,
      hb: await db()
        .prepare("SELECT detail, created_at AS at FROM admin_logs WHERE action = 'probe.heartbeat' AND target = ? ORDER BY id DESC LIMIT 1")
        .bind(p.name)
        .first<{ detail: string | null; at: number }>(),
    })),
  );
  const { results: probeEvents } = probeRows.length
    ? await db()
        .prepare("SELECT admin_email, action, target, created_at AS at FROM admin_logs WHERE action IN ('probe.down', 'probe.up') ORDER BY id DESC LIMIT 5")
        .all<{ admin_email: string; action: string; target: string; at: number }>()
    : { results: [] };

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-2 text-2xl font-bold">{t("域名切换", "Domain switch")}</h1>
      <p className="mb-4 text-sm text-base-content/60">
        {t(
          "节点的 Host 地址填域名时，那个节点的 IP 被墙了，在这里把域名改到备用机的 IP，客人不用更新订阅，一般 1～5 分钟内就连到新 IP。备用机要先装好节点、连上面板、跑着同一个入站。只列灰色云朵的 A 记录。",
          "When a node's Host address is a domain and its IP gets blocked, point the domain at a standby IP here. Customers don't need to update their subscription; clients usually follow within 1-5 minutes. The standby server must already run the node, be connected to the panel and serve the same inbound. Only DNS-only A records are listed.",
        )}
      </p>

      {"error" in cfg && (
        <div role="alert" className="alert alert-error alert-soft mb-4">
          {cfg.error}
        </div>
      )}
      {marzbanError && (
        <div role="alert" className="alert alert-warning alert-soft mb-4">
          {t("查 Marzban 出错，下面认不出节点和 Host：", "Marzban error, nodes and Hosts can't be matched below: ")}
          {marzbanError}
        </div>
      )}
      {!("error" in cfg) && cfg.zones.length === 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body gap-2 p-4 text-sm">
            <p className="font-bold">{t("还没配域名", "No domains configured")}</p>
            <p>
              {t(
                "在 Cloudflare 的 My Profile → API Tokens 建一个 token：权限选 Zone → DNS → Edit，Zone Resources 只选节点用的那个域名。然后在 portal 目录运行：",
                "In Cloudflare, create a token under My Profile → API Tokens with Zone → DNS → Edit, limited to the node domain only. Then run in the portal folder:",
              )}
            </p>
            <pre className="rounded-box bg-base-200 p-2 text-xs">npx wrangler secret put DNS_ZONES</pre>
            <p>{t("粘贴（几个域名就写几项，每项用自己的 token）：", "and paste (one item per domain, each with its own token):")}</p>
            <pre className="rounded-box bg-base-200 p-2 text-xs">{'[{"zone":"example.com","token":"..."}]'}</pre>
          </div>
        </div>
      )}

      {"error" in prCfg && (
        <div role="alert" className="alert alert-error alert-soft mb-4">
          {prCfg.error}
        </div>
      )}
      {probeRows.length > 0 && (
        <div className="card mb-4 bg-base-100 shadow-sm" data-testid="probes">
          <div className="card-body gap-3 p-4">
            <h2 className="font-bold">{t("国内检测机", "Probes in China")}</h2>
            <p className="text-sm text-base-content/60">
              {t(
                "放在国内的电脑每 5 分钟连一遍各节点，连续 15 分钟连不上（同时国内网站和海外测速机都通）就发邮件「疑似被墙」，恢复了再发一封。超过 20 分钟没来报告，说明那台电脑关机、睡眠或者断网了。",
                "Computers in China check every node every 5 minutes. If a node stays unreachable for 15 minutes while domestic sites and overseas test servers work, you get a 'possible block' email, and another when it recovers. No report for 20 minutes means that computer is off, asleep or offline.",
              )}
            </p>
            {probeRows.map((p) => {
              const stale = !p.hb || now - p.hb.at > PROBE_STALE;
              return (
                <div key={p.name} className="flex flex-wrap items-center justify-between gap-2 rounded-box border border-base-300 p-3" data-testid="probe">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{p.name}</span>
                    <span className={`badge badge-sm badge-soft ${stale ? "badge-error" : "badge-success"}`}>{stale ? t("没在报告", "silent") : t("在线", "online")}</span>
                  </div>
                  <span className={`text-sm ${p.hb?.detail?.includes("连不上") ? "font-bold text-error" : "text-base-content/60"}`}>
                    {p.hb ? `${p.hb.detail ?? ""}（${agoText(p.hb.at, now, en)}）` : t("还没来报告过：脚本装好、第一次运行后才会有", "Never reported; it shows up after the script first runs")}
                  </span>
                </div>
              );
            })}
            {probeEvents.length > 0 && (
              <div className="text-xs text-base-content/60">
                {t("最近：", "Recent: ")}
                {probeEvents.map((e, i) => (
                  <span key={i} className={`mr-3 ${e.action === "probe.down" ? "text-error" : "text-success"}`}>
                    {e.action === "probe.down" ? t("连不上", "down") : t("恢复", "up")} {e.target}（{e.admin_email.replace(/^检测机 /, "")}，{agoText(e.at, now, en)}）
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {"error" in sbCfg && (
        <div role="alert" className="alert alert-error alert-soft mb-4">
          {sbCfg.error}
        </div>
      )}
      {standbys.length > 0 && (
        <div className="card mb-4 bg-base-100 shadow-sm" data-testid="standbys">
          <div className="card-body gap-3 p-4">
            <h2 className="font-bold">{t("备用机", "Standby servers")}</h2>
            <p className="text-sm text-base-content/60">
              {t(
                "节点被墙时，在下面那条记录的「新 IP」里选备用机、点切换。备用机每 15 秒来问一次「有没有域名指向我」，看到了就自动变成那个节点（换入站、转端口），不用登录服务器。用完把记录改回去（或改到新机器），备用机会自动回到待命。一台备用机同时只能顶替一个节点。",
                "When a node is blocked, pick a standby in that record's New IP box and switch. Every 15s the standby asks whether a domain points at it and turns itself into that node (inbound and port forwarding), no login needed. Point the record elsewhere afterwards and the standby goes back to standing by. One standby can serve one node at a time.",
              )}
            </p>
            {standbyRows.map(({ s, r, st, report, ready }) => (
              <div key={s.name} className="flex flex-col gap-1 rounded-box border border-base-300 p-3" data-testid="standby">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{s.name}</span>
                    {st ? <span className={`badge badge-sm ${st.badge}`}>{st.text}</span> : <span className="badge badge-sm badge-error badge-soft">{t("面板里没有这个节点", "not a panel node")}</span>}
                    {s.ip && <span className="font-mono text-sm">{s.ip}</span>}
                  </div>
                  <span className="text-sm">
                    {!r ? (
                      <span className="text-error">{t("先在面板里用这个名字加上备用机（地址填 IP）", "Add the standby to the panel under this name (address = IP)")}</span>
                    ) : "error" in r ? (
                      <span className="text-error">{r.error}</span>
                    ) : (
                      <>
                        <span className={r.role ? "font-bold text-warning" : "text-base-content/60"}>{t("应该：", "Should be: ") + roleText(r.role, en)}</span>
                        {r.names.length > 0 && <span className="ml-2 text-base-content/60">← {r.names.join(t("、", ", "))}</span>}
                      </>
                    )}
                  </span>
                </div>
                {/* 备用机自己的回报（换角色时写进操作日志）：和「应该」对上了才算真的切好了 */}
                <div className="text-xs" data-testid="standby-ready" data-state={ready}>
                  {ready === "ready" && <span className="text-success">✓ {t("已就绪", "Ready")}</span>}
                  {ready === "waiting" && <span className="text-warning">⏳ {t("等备用机来问（每 15 秒一次），页面会自动刷新", "Waiting for the standby to check in (every 15s); this page refreshes itself")}</span>}
                  {ready === "error" && <span className="text-error">✗ {t("备用机切换失败，看下面的回报，或者登录备用机看 journalctl -u standby-agent", "The standby failed to switch; see its report below or run journalctl -u standby-agent on it")}</span>}
                  {ready === "unknown" && <span className="text-base-content/60">{t("还没收到过备用机的回报：遥控程序装好、第一次换角色后才会有", "No report from the standby yet; it reports after the agent is installed and first changes role")}</span>}
                  {report && (
                    <span className="ml-2 text-base-content/50">
                      {t("最近回报：", "Last report: ")}
                      {report.detail}（{agoText(report.at, now, en)}）
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <AutoRefresh active={standbyRows.some((x) => x.ready === "waiting")} />

      <div className="flex flex-col gap-4">
        {zones.map((z) => {
          const shown = z.records.filter(switchable);
          const hidden = z.records.length - shown.length;
          return (
            <div key={z.zone} className="card bg-base-100 shadow-sm" data-testid="dns-zone">
              <div className="card-body gap-3 p-4">
                <h2 className="font-bold">{z.zone}</h2>
                {z.error && (
                  <div role="alert" className="alert alert-error alert-soft text-sm">
                    {t("查 Cloudflare 出错：", "Cloudflare error: ")}
                    {z.error}
                  </div>
                )}
                {!z.error && shown.length === 0 && <p className="text-sm text-base-content/60">{t("这个域名下没有灰色云朵的 A 记录。", "No DNS-only A records in this domain.")}</p>}
                {shown.map((r) => {
                  const used = hostsUsing(r.name, hosts);
                  const node = nodeByIp.get(r.content);
                  return (
                    <div key={r.id} className="flex flex-col gap-2 rounded-box border border-base-300 p-3" data-testid="dns-record">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-bold">{r.name}</span>
                        <span className="text-sm">
                          → <span className="font-mono">{r.content}</span>
                          {node ? (
                            <span className={`badge badge-sm badge-soft ml-2 ${standbyIps.has(r.content) ? "badge-warning" : "badge-success"}`}>
                              {node}
                              {standbyIps.has(r.content) && t("（备用机）", " (standby)")}
                            </span>
                          ) : (
                            <span className="badge badge-sm badge-ghost ml-2">{t("不是面板里的节点", "not a panel node")}</span>
                          )}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-base-content/60">
                        <span className={r.ttl === 1 || r.ttl > 60 ? "text-warning" : ""}>
                          TTL {ttlText(r.ttl, en)}
                          {(r.ttl === 1 || r.ttl > 60) && t("（建议改成 1 分钟，切换才快）", " (set it to 1 min so switches are quick)")}
                        </span>
                        <span>
                          {used.length
                            ? t("用到它的 Host：", "Used by Hosts: ") + used.map((h) => `${h.remark}${h.disabled ? t("（停用）", " (disabled)") : ""}`).join(t("、", ", "))
                            : t("没有 Host 用它", "No Host uses it")}
                        </span>
                      </div>
                      <SwitchForm zone={z.zone} record={r.id} name={r.name} current={r.content} choices={choices.filter((c) => c.ip !== r.content)} />
                    </div>
                  );
                })}
                {hidden > 0 && <p className="text-xs text-base-content/50">{t(`另外 ${hidden} 条橙色云朵的记录不在这里改。`, `${hidden} proxied record(s) are not managed here.`)}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
