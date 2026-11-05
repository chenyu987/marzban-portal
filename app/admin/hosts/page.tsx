import { requireAdmin } from "@/lib/admin";
import { getHosts, listInbounds, type Inbound, type ProxyHost } from "@/lib/marzban";
import AdminHeader from "../AdminHeader";
import HostEditor from "./HostEditor";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

// 入站和 Host：每个入站下面的 Host 决定客人订阅里出现哪些节点、叫什么名字、连哪个地址。
// 一个入站一张卡片，改完单独保存；保存时只替换这个入站的 Host，别的入站从 Marzban 现取，不会被覆盖
export default async function HostsPage() {
  const admin = await requireAdmin();
  const { t } = await getT();
  let error = "";
  let inbounds: Inbound[] = [];
  let hosts: Record<string, ProxyHost[]> = {};
  try {
    const [ib, h] = await Promise.all([listInbounds(), getHosts()]);
    inbounds = Object.values(ib).flat();
    hosts = h;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <h1 className="mt-4 mb-2 text-2xl font-bold">{t("入站和 Host", "Inbounds & Hosts")}</h1>
      <p className="mb-4 text-sm text-base-content/60">
        {t(
          "备注就是客人在客户端里看到的节点名，可以用 {USERNAME}、{DATA_LEFT}、{DAYS_LEFT}、{EXPIRE_DATE} 这些变量。地址和端口是客人实际连的地址，端口留空就用入站的端口。改错了客人会连不上，保存前看清楚；Xray 配置本身（入站、REALITY 密钥）还是去面板改。",
          "The remark is the node name customers see in their client; variables like {USERNAME}, {DATA_LEFT}, {DAYS_LEFT}, {EXPIRE_DATE} work. Address and port are what customers actually connect to; leave the port empty to use the inbound's. Mistakes cut customers off, so check before saving. Xray config itself (inbounds, REALITY keys) is still edited in the panel.",
        )}
      </p>
      {error && (
        <div role="alert" className="alert alert-error alert-soft mb-4">
          {t("查 Marzban 出错：", "Marzban error: ")}
          {error}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {inbounds.map((ib) => (
          <div key={ib.tag} className="card bg-base-100 shadow-sm" data-testid="inbound">
            <div className="card-body gap-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-bold">{ib.tag}</h2>
                <span className="badge badge-sm">{ib.protocol}</span>
                <span className="badge badge-sm badge-ghost">
                  {ib.network} / {ib.tls} / {t("端口", "port")} {ib.port}
                </span>
              </div>
              <HostEditor tag={ib.tag} initial={hosts[ib.tag] ?? []} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
