import { requireAdmin } from "@/lib/admin";
import { coreStats, getSystem, listNodes, nodeSettings, nodesUsage, type MarzbanNode } from "@/lib/marzban";
import { formatBytes } from "@/lib/format";
import { monthStartBeijing, NODE_STATUS_LABEL } from "@/lib/admin-users";
import AdminHeader from "../AdminHeader";
import { CoreActions, NodeActions, NodeForm } from "./NodeControls";

export const dynamic = "force-dynamic";

// 节点和系统：面板本机和各节点的在线状态、Xray 版本、本月流量；加节点、改、停用、重连、删除；重启 Xray。都直接改 Marzban
export default async function NodesPage() {
  const admin = await requireAdmin();
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

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">节点和系统</h1>
      {error && (
        <div role="alert" className="alert alert-error alert-soft mb-4">
          查 Marzban 出错：{error}
        </div>
      )}

      {core && system && (
        <div className="card mb-6 bg-base-100 shadow-sm">
          <div className="card-body gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="card-title">面板本机（主节点）</h2>
              <span className={`badge ${core.started ? "badge-success" : "badge-error"}`}>{core.started ? "Xray 运行中" : "Xray 没在跑"}</span>
            </div>
            <div className="grid gap-2 text-sm sm:grid-cols-4">
              <div>
                <div className="text-base-content/60">Marzban / Xray</div>
                <div className="font-medium">
                  {system.version} / {core.version}
                </div>
              </div>
              <div>
                <div className="text-base-content/60">CPU</div>
                <div className="font-medium">
                  {system.cpu_cores} 核，{system.cpu_usage.toFixed(0)}%
                </div>
              </div>
              <div>
                <div className="text-base-content/60">内存</div>
                <div className="font-medium">
                  {formatBytes(system.mem_used)} / {formatBytes(system.mem_total)}
                </div>
              </div>
              <div>
                <div className="text-base-content/60">本月流量</div>
                <div className="font-medium">{formatBytes(usage.get(null) ?? 0)}</div>
              </div>
            </div>
            <CoreActions />
          </div>
        </div>
      )}

      <h2 className="mb-2 text-lg font-bold">节点（{nodes.length}）</h2>
      <div className="flex flex-col gap-3">
        {nodes.map((n) => {
          const st = NODE_STATUS_LABEL[n.status] ?? { text: n.status, badge: "badge-neutral" };
          return (
            <div key={n.id} className="card bg-base-100 shadow-sm" data-testid="node">
              <div className="card-body gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{n.name}</span>
                    <span className={`badge badge-sm ${st.badge}`}>{st.text}</span>
                  </div>
                  <span className="text-sm text-base-content/60">
                    {n.address}:{n.port}（API {n.api_port}）｜Xray {n.xray_version ?? "-"}｜倍率 {n.usage_coefficient}｜本月 {formatBytes(usage.get(n.id) ?? 0)}
                  </span>
                </div>
                {n.status === "error" && n.message && <div className="alert alert-error alert-soft text-sm">{n.message}</div>}
                <NodeActions node={n} />
              </div>
            </div>
          );
        })}
        {!error && nodes.length === 0 && <p className="text-sm text-base-content/60">还没有节点。</p>}
      </div>

      <h2 className="mt-8 mb-2 text-lg font-bold">加节点</h2>
      <p className="mb-2 text-sm text-base-content/60">
        先在新服务器上装好 Marzban Node，把下面的证书放进去（docs/operations.md 有步骤），再在这里加。加好后 Marzban 会照主节点给它加一份 Host，客人订阅里马上多出这个节点。
      </p>
      <NodeForm />
      {cert && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-base-content/70">节点证书（装 Marzban Node 时用）</summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-box bg-base-200 p-2 text-xs">{cert}</pre>
        </details>
      )}
    </div>
  );
}
