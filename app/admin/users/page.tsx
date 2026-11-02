import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { getSystem, listUsers, type MarzbanUser, type SystemStats, type UserStatus } from "@/lib/marzban";
import { formatBytes, formatExpire, RESET_LABEL, STATUS_LABEL } from "@/lib/format";
import { onlineText, SORTS, STATUS_FILTERS } from "@/lib/admin-users";
import AdminHeader from "../AdminHeader";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

// Marzban 用户列表：直接查 Marzban，和面板是同一份数据。能按用户名、备注搜，按状态筛，排序，翻页
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const q = str("q");
  const status = (STATUS_FILTERS as readonly string[]).includes(str("status")) ? (str("status") as UserStatus) : undefined;
  const sort = str("sort") in SORTS ? str("sort") : "-created_at";
  const page = Math.max(1, Number.parseInt(str("page"), 10) || 1);

  let data: { users: MarzbanUser[]; total: number } | null = null;
  let system: SystemStats | null = null;
  let error = "";
  try {
    [data, system] = await Promise.all([
      listUsers({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, search: q || undefined, status, sort }),
      getSystem(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 这一页的用户各绑在哪个客人名下
  const names = data?.users.map((u) => u.username) ?? [];
  const owners = new Map<string, { id: number; email: string; wechat: string | null }>();
  if (names.length) {
    const { results } = await db()
      .prepare(
        `SELECT s.marzban_username, c.id, c.email, c.wechat FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         WHERE s.marzban_username IN (${names.map(() => "?").join(",")})`,
      )
      .bind(...names)
      .all<{ marzban_username: string; id: number; email: string; wechat: string | null }>();
    for (const r of results) owners.set(r.marzban_username, r);
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (sort !== "-created_at") qs.set("sort", sort);
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };
  const now = Date.now();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">用户</h1>
        <Link href="/admin/users/new" className="btn btn-primary btn-sm">
          新建用户
        </Link>
      </div>

      {system && (
        <div className="stats stats-vertical mb-4 w-full bg-base-100 shadow-sm sm:stats-horizontal">
          <div className="stat">
            <div className="stat-title">在用 / 全部用户</div>
            <div className="stat-value text-2xl">
              {system.users_active} / {system.total_user}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">总流量</div>
            <div className="stat-value text-2xl">{formatBytes(system.incoming_bandwidth + system.outgoing_bandwidth)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">面板内存</div>
            <div className="stat-value text-2xl">
              {formatBytes(system.mem_used)} / {formatBytes(system.mem_total)}
            </div>
            <div className="stat-desc">
              CPU {system.cpu_cores} 核，{system.cpu_usage.toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="用户名或备注" className="input input-sm w-48" />
        <select name="status" defaultValue={status ?? ""} className="select select-sm w-36">
          <option value="">全部状态</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]?.text ?? s}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} className="select select-sm w-44">
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-sm">搜索</button>
      </form>

      {error && (
        <div role="alert" className="alert alert-error alert-soft">
          查 Marzban 出错：{error}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>用户名</th>
                <th>客人</th>
                <th>状态</th>
                <th>到期</th>
                <th>流量</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const owner = owners.get(u.username);
                const st = STATUS_LABEL[u.status] ?? { text: u.status, badge: "badge-neutral" };
                return (
                  <tr key={u.username} className="hover" data-testid="marzban-user">
                    <td>
                      <Link href={`/admin/users/${encodeURIComponent(u.username)}`} className="link link-primary">
                        {u.username}
                      </Link>
                      <div className="text-xs text-base-content/50">{onlineText(u.online_at, now)}</div>
                    </td>
                    <td>
                      {owner ? (
                        <Link href={`/admin/customers/${owner.id}`} className="link link-hover">
                          {owner.wechat ?? owner.email}
                        </Link>
                      ) : (
                        <span className="text-base-content/40">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-sm ${st.badge}`}>{st.text}</span>
                    </td>
                    <td className="whitespace-nowrap">{formatExpire(u.expire)}</td>
                    <td className="whitespace-nowrap">
                      {formatBytes(u.used_traffic)} / {u.data_limit ? formatBytes(u.data_limit) : "不限"}
                      {u.data_limit ? <div className="text-xs text-base-content/50">{RESET_LABEL[u.data_limit_reset_strategy ?? ""] ?? "不重置"}</div> : null}
                    </td>
                    <td className="max-w-48 truncate text-base-content/60">{u.note || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.users.length === 0 && <p className="py-4 text-sm text-base-content/60">没有符合条件的用户。</p>}
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-base-content/60">
              共 {data.total} 个，第 {page} / {pages} 页
            </span>
            <div className="join">
              {page > 1 && (
                <Link href={href(page - 1)} className="btn btn-sm join-item">
                  上一页
                </Link>
              )}
              {page < pages && (
                <Link href={href(page + 1)} className="btn btn-sm join-item">
                  下一页
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
