import { requireAdmin } from "@/lib/admin";
import { coreStats, getSystem, listNodes, nodeSettings, nodesUsage, type MarzbanNode } from "@/lib/marzban";
import { formatBytes } from "@/lib/format";
import { monthStartBeijing, nodeStatusLabel } from "@/lib/admin-users";
import { getT } from "@/lib/lang";
import AdminHeader from "../AdminHeader";
import { CoreActions, NodeActions, NodeForm } from "./NodeControls";

export const dynamic = "force-dynamic";

// 节点和系统：面板本机和各节点的在线状态、Xray 版本、本月流量；加节点、改、停用、重连、删除；重启 Xray。都直接改 Marzban
export default async function NodesPage() {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const now = Date.now();
  let error = "";
  let nodes: MarzbanNode[] = [];
  let core: Awaited<ReturnType<typeof coreStats>> | null = null;
  let system: Awaited<ReturnType<typeof getSystem>> | null = null;
  let usage = new Map<number | null, number>();
  let cert = "";
  try {
    const [n, c, s, u, st] = await Promise.all([
      listNodes(),
      coreStats(),
      getSystem(),
      nodesUsage(monthStartBeijing(now), new Date(now)),
      nodeSettings(),
    ]);
    nodes = n;
    core = c;
    system = s;
    usage = new Map(u.usages.map((x) => [x.node_id, x.uplink + x.downlink]));
    cert = st.certificate;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 各节点本月流量画成条，最多的那个是满格，一眼看出流量都跑在哪
  const maxUsage = Math.max(1, ...usage.values());

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">{t("节点和系统", "Nodes & system")}</h1>
      {error && (
        <div role="alert" className="alert alert-error alert-soft mb-4">
          {t("查 Marzban 出错：", "Marzban error: ")}
          {error}
        </div>
      )}

      {/* 面板本机：和下面的节点卡片一样的三行。第一行名字、状态标签，右边版本和本月流量；第二行 CPU、内存两根条；第三行重启按钮，靠左 */}
      {core && system && (
        <div className="card mb-6 bg-base-100 shadow-sm" data-testid="core" data-started={core.started ? "1" : "0"}>
          <div className="card-body gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-bold">{t("面板本机", "Panel host")}</span>
                {(() => {
                  const st = nodeStatusLabel(core.started ? "connected" : "error", lang);
                  return <span className={`badge badge-sm ${st.badge}`}>{st.text}</span>;
                })()}
              </div>
              <span className="text-sm text-base-content/60">
                {t(
                  `Marzban ${system.version}｜Xray ${core.version}｜本月 ${formatBytes(usage.get(null) ?? 0)}`,
                  `Marzban ${system.version} | Xray ${core.version} | ${formatBytes(usage.get(null) ?? 0)} this month`,
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs text-base-content/60">
              {[
                { label: "CPU", pct: system.cpu_usage, text: t(`${system.cpu_usage.toFixed(0)}%（${system.cpu_cores} 核）`, `${system.cpu_usage.toFixed(0)}% (${system.cpu_cores} core${system.cpu_cores === 1 ? "" : "s"})`) },
                {
                  label: t("内存", "Memory"),
                  pct: system.mem_total ? (system.mem_used / system.mem_total) * 100 : 0,
                  text: `${formatBytes(system.mem_used)} / ${formatBytes(system.mem_total)}`,
                },
              ].map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  {m.label}
                  <progress className={`progress w-48 ${m.pct >= 85 ? "progress-error" : m.pct >= 60 ? "progress-warning" : "progress-success"}`} value={m.pct} max={100} />
                  <span className="text-base-content">{m.text}</span>
                </div>
              ))}
            </div>
            <CoreActions />
          </div>
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold">{t(`节点（${nodes.length}）`, `Nodes (${nodes.length})`)}</h2>
      <div className="flex flex-col gap-3">
        {nodes.map((n) => {
          const st = nodeStatusLabel(n.status, lang);
          return (
            <div key={n.id} className="card bg-base-100 shadow-sm" data-testid="node">
              <div className="card-body gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{n.name}</span>
                    <span className={`badge badge-sm ${st.badge}`}>{st.text}</span>
                  </div>
                  <span className="text-sm text-base-content/60">
                    {t(
                      `${n.address}:${n.port}（API ${n.api_port}）｜Xray ${n.xray_version ?? "-"}｜倍率 ${n.usage_coefficient}｜本月 ${formatBytes(usage.get(n.id) ?? 0)}`,
                      `${n.address}:${n.port} (API ${n.api_port}) | Xray ${n.xray_version ?? "-"} | ×${n.usage_coefficient} | ${formatBytes(usage.get(n.id) ?? 0)} this month`,
                    )}
                  </span>
                </div>
                {n.status === "error" && n.message && <div className="alert alert-error alert-soft text-sm">{n.message}</div>}
                {/* 第二行本月流量条，第三行重连、停用、修改、删除，靠左 */}
                <NodeActions
                  node={n}
                  lead={
                    <div className="flex items-center gap-2 text-xs text-base-content/60">
                      {t("本月流量", "This month")}
                      <progress className="progress progress-primary w-48" value={usage.get(n.id) ?? 0} max={maxUsage} />
                    </div>
                  }
                />
              </div>
            </div>
          );
        })}
        {!error && nodes.length === 0 && <p className="text-sm text-base-content/60">{t("还没有节点。", "No nodes yet.")}</p>}
      </div>

      <h2 className="mt-8 mb-2 text-lg font-bold">{t("加节点", "Add a node")}</h2>
      <p className="mb-2 text-sm text-base-content/60">
        {t(
          "先在新服务器上装好 Marzban Node，把下面的证书放进去（docs/operations.md 有步骤），再在这里加。加好后 Marzban 会照主节点给它加一份 Host，客人订阅里马上多出这个节点。",
          "Install Marzban Node on the new server with the certificate below (steps in docs/operations.md), then add it here. Marzban copies the main node's Hosts for it and it shows up in subscriptions right away.",
        )}
      </p>
      <NodeForm />
      {cert && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-base-content/70">{t("节点证书（装 Marzban Node 时用）", "Node certificate (for installing Marzban Node)")}</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-box bg-base-200 p-2 text-xs">{cert}</pre>
        </details>
      )}
    </div>
  );
}
