import { requireAdmin } from "@/lib/admin";
import ResizableTable from "../ResizableTable";
import { db } from "@/lib/env";
import { formatExpire } from "@/lib/format";
import Link from "next/link";
import AdminHeader from "../AdminHeader";
import { SubLink } from "../Links";
import { FilterBar, Pager, pageOf, param } from "../ui";
import { LOG_ACTIONS, logActionLabels } from "@/lib/admin-account";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

// 操作日志：最近 200 条，能按管理员邮箱、操作类型筛

type Row = { id: number; admin_email: string; action: string; target: string | null; detail: string | null; ip: string | null; created_at: number };

const PAGE_SIZE = 50;
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// 「对谁」、「说明」是写日志时存下的中文，切到英文也照原样显示
// 「对谁」能点进去：订阅 → 订阅详情，订单 → 订单列表，客人邮箱 → 客人，节点 / Host / 兑换码 → 对应页面
function Target({ action, target }: { action: string; target: string | null }) {
  if (!target) return null;
  const order = /^订单 ([\d-]+)$/.exec(target);
  if (order) return <Link href={`/admin?view=all&q=${order[1].replace("-", "")}`} className="link link-hover">{target}</Link>;
  if (action.startsWith("user.")) return <SubLink username={target} />;
  if (["balance.adjust", "password.reset_link", "subscription.bind", "subscription.auto_bind"].includes(action))
    return <Link href={`/admin/customers?q=${encodeURIComponent(target)}`} className="link link-hover">{target}</Link>;
  const page = action.startsWith("node.") || action === "core.restart" ? "/admin/nodes" : action === "hosts.save" ? "/admin/hosts" : action.startsWith("dns.") || action.startsWith("standby.") || action.startsWith("probe.") ? "/admin/dns" : action.startsWith("code") ? "/admin/codes" : action.startsWith("users.") ? "/admin/users" : "";
  return page ? <Link href={page} className="link link-hover">{target}</Link> : <>{target}</>;
}

export default async function LogsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const me = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
  const ACTIONS = logActionLabels(lang);
  const sp = await searchParams;
  const admin = param(sp, "admin");
  const action = param(sp, "action") in LOG_ACTIONS ? param(sp, "action") : "";
  const q = param(sp, "q");
  const page = pageOf(sp);
  // probe.heartbeat 是检测机「最后一次报告」的那一行（原地更新），不算操作，不在这里列
  const W = `WHERE action != 'probe.heartbeat' AND (?1 = '' OR admin_email = ?1) AND (?2 = '' OR action = ?2) AND (?3 = '' OR target LIKE ?4 ESCAPE '\\' OR detail LIKE ?4 ESCAPE '\\')`;
  const [{ results }, { results: admins }, count] = await Promise.all([
    db()
      .prepare(`SELECT id, admin_email, action, target, detail, ip, created_at FROM admin_logs ${W} ORDER BY id DESC LIMIT ?5 OFFSET ?6`)
      .bind(admin, action, q, like(q), PAGE_SIZE, (page - 1) * PAGE_SIZE)
      .all<Row>(),
    db().prepare("SELECT DISTINCT admin_email FROM admin_logs ORDER BY admin_email").all<{ admin_email: string }>(),
    db().prepare(`SELECT COUNT(*) AS n FROM admin_logs ${W}`).bind(admin, action, q, like(q)).first<{ n: number }>(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={me.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">{t("操作日志", "Activity log")}</h1>
      <FilterBar
        base="/admin/logs"
        active={!!(admin || action || q)}
        summary={
          <>
            <b>{count?.n ?? 0}</b> {t("条", "entries")}
          </>
        }
      >
        <input name="q" defaultValue={q} placeholder={t("搜对谁、说明", "Search target or details")} className="input input-sm w-48" />
        <select name="admin" defaultValue={admin} className="select select-sm" aria-label={t("谁", "Who")}>
          <option value="">{t("所有人", "Everyone")}</option>
          {admins.map((a) => (
            <option key={a.admin_email} value={a.admin_email}>
              {a.admin_email}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={action} className="select select-sm" aria-label={t("操作", "Action")}>
          <option value="">{t("所有操作", "All actions")}</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </FilterBar>
      {results.length === 0 && <p className="text-sm text-base-content/60">{t("没有记录。", "No entries.")}</p>}
      <div className="overflow-x-auto rounded-box bg-base-100 shadow-sm">
        <ResizableTable id="logs" className="table table-sm">
          <thead>
            <tr>
              <th>{t("时间", "Time")}</th>
              <th>{t("谁", "Who")}</th>
              <th>{t("做了什么", "Action")}</th>
              <th>{t("对谁", "Target")}</th>
              <th>{t("说明", "Details")}</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {results.map((l) => (
              <tr key={l.id} className={l.action === "login.fail" ? "text-error" : ""}>
                <td className="whitespace-nowrap">{formatExpire(l.created_at, lang, tz)}</td>
                <td>{l.admin_email}</td>
                <td className="whitespace-nowrap">{ACTIONS[l.action] ?? l.action}</td>
                <td>
                  <Target action={l.action} target={l.target} />
                </td>
                <td className="text-base-content/70">{l.detail ?? ""}</td>
                <td className="text-base-content/60">{l.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </ResizableTable>
      </div>
      <Pager base="/admin/logs" params={{ admin, action, q }} page={page} pageSize={PAGE_SIZE} total={count?.n ?? 0} />
    </div>
  );
}
