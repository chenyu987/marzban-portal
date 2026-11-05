import Link from "next/link";
import ResizableTable from "../ResizableTable";
import { adminPrefs, requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { getSystem, listUsers, type MarzbanUser, type SystemStats, type UserStatus } from "@/lib/marzban";
import { formatBytes, formatExpire, statusLabel } from "@/lib/format";
import { expireRelative, LOCAL_SORTS, ONLINE_WINDOWS, onlineState, onlineWindowLabel, onlineWithin, parseOnlineWindow, parsePageSize, sortByOnline, PAGE_SIZES, SORTS, sortLabels, STATUS_FILTERS } from "@/lib/admin-users";
import AdminHeader from "../AdminHeader";
import { CustomerLink } from "../Links";
import { CopyText } from "../CopyButton";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import BulkActions from "./BulkActions";
import PageSize from "./PageSize";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";
import { FilterBar } from "../ui";
import { groupName } from "@/lib/plan-text";

export const dynamic = "force-dynamic";

// Marzban 用户列表：直接查 Marzban，和面板是同一份数据。能按用户名、备注搜，按状态筛，排序，翻页
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const q = str("q");
  const status = (STATUS_FILTERS as readonly string[]).includes(str("status")) ? (str("status") as UserStatus) : undefined;
  // 网址里没带的，用管理员在「我的账户」里设的偏好
  const prefs = await adminPrefs(admin.id);
  const defaultSort = prefs.sort && prefs.sort in SORTS ? prefs.sort : "-created_at";
  const defaultSize = prefs.pageSize && (PAGE_SIZES as readonly number[]).includes(prefs.pageSize) ? prefs.pageSize : parsePageSize("");
  const sort = str("sort") in SORTS ? str("sort") : defaultSort;
  const page = Math.max(1, Number.parseInt(str("page"), 10) || 1);
  const PAGE_SIZE = str("size") ? parsePageSize(str("size")) : defaultSize;
  const online = parseOnlineWindow(str("online"));

  let data: { users: MarzbanUser[]; total: number } | null = null;
  let system: SystemStats | null = null;
  let error = "";
  try {
    // 按在线筛、按最近在线排：Marzban 的接口都不认，先把（符合别的条件的）全部取回来，在这里筛、排完再分页。订阅不多，一次取得完
    const localSort = LOCAL_SORTS.includes(sort);
    const fetchUsers = online || localSort
      ? listUsers({ offset: 0, limit: 5000, search: q || undefined, status, sort: localSort ? undefined : sort }).then((all) => {
          let hit = online ? all.users.filter((u) => onlineWithin(u.online_at, Date.now(), online)) : all.users;
          if (localSort) hit = sortByOnline(hit);
          return { users: hit.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), total: hit.length };
        })
      : listUsers({ offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE, search: q || undefined, status, sort });
    [data, system] = await Promise.all([fetchUsers, getSystem()]);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  // 这一页的用户各绑在哪个客人名下
  const names = data?.users.map((u) => u.username) ?? [];
  const owners = new Map<string, { id: number; email: string; wechat: string | null }>();
  const legacyWechat = new Map<string, string>();
  const planOf = new Map<string, string>();
  // D1 一条语句最多绑 100 个参数，名单整个当一个 JSON 传进去
  const namesJson = JSON.stringify(names);
  if (names.length) {
    const { results } = await db()
      .prepare(
        `SELECT s.marzban_username, c.id, c.email, c.wechat FROM subscriptions s JOIN customers c ON c.id = s.customer_id
         WHERE s.marzban_username IN (SELECT value FROM json_each(?))`,
      )
      .bind(namesJson)
      .all<{ marzban_username: string; id: number; email: string; wechat: string | null }>();
    for (const r of results) owners.set(r.marzban_username, r);
    // 没绑客人的老订阅：显示记着的微信号
    const { results: old } = await db()
      .prepare(`SELECT marzban_username, wechat FROM marzban_users WHERE wechat IS NOT NULL AND marzban_username IN (SELECT value FROM json_each(?))`)
      .bind(namesJson)
      .all<{ marzban_username: string; wechat: string }>();
    for (const r of old) legacyWechat.set(r.marzban_username, r.wechat);
    const { results: plans } = await db()
      .prepare(`SELECT marzban_username, plan_id FROM marzban_users WHERE plan_id IS NOT NULL AND marzban_username IN (SELECT value FROM json_each(?))`)
      .bind(namesJson)
      .all<{ marzban_username: string; plan_id: string }>();
    for (const r of plans) planOf.set(r.marzban_username, ((p) => (p ? groupName(p.group ?? p.name, lang) : r.plan_id))(findPlan(site.plans, r.plan_id)));
  }

  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set("q", q);
    if (status) qs.set("status", status);
    if (online) qs.set("online", String(online));
    if (sort !== defaultSort) qs.set("sort", sort);
    if (PAGE_SIZE !== defaultSize) qs.set("size", String(PAGE_SIZE));
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return `/admin/users${s ? `?${s}` : ""}`;
  };
  const now = Date.now();

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <div className="mt-4 mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">{t("订阅", "Subscriptions")}</h1>
        </div>
        <Link href="/admin/users/new" className="btn btn-primary btn-sm">
          {t("新建订阅", "New subscription")}
        </Link>
      </div>

      {system && (
        <div className="stats stats-vertical mb-4 w-full bg-base-100 shadow-sm sm:stats-horizontal">
          <div className="stat">
            <div className="stat-title">{t("在用 / 全部订阅", "Active / all subscriptions")}</div>
            <div className="stat-value text-2xl">
              {system.users_active} / {system.total_user}
            </div>
          </div>
          <div className="stat">
            <div className="stat-title">{t("总流量", "Total traffic")}</div>
            <div className="stat-value text-2xl">{formatBytes(system.incoming_bandwidth + system.outgoing_bandwidth)}</div>
          </div>
          <div className="stat">
            <div className="stat-title">{t("面板内存", "Panel memory")}</div>
            <div className="stat-value text-2xl">
              {formatBytes(system.mem_used)} / {formatBytes(system.mem_total)}
            </div>
            <div className="stat-desc">
              {t(`CPU ${system.cpu_cores} 核，${system.cpu_usage.toFixed(0)}%`, `CPU ${system.cpu_cores} core${system.cpu_cores === 1 ? "" : "s"}, ${system.cpu_usage.toFixed(0)}%`)}
            </div>
          </div>
        </div>
      )}

      <FilterBar base="/admin/users">
        <select name="online" defaultValue={online ?? ""} className="select select-sm w-36" aria-label={t("在线", "Online")}>
          <option value="">{t("不限在线", "Any activity")}</option>
          {ONLINE_WINDOWS.map((m) => (
            <option key={m} value={m}>
              {onlineWindowLabel(m, lang)}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder={t("订阅名或备注", "Name or note")} className="input input-sm w-48" />
        <select name="status" defaultValue={status ?? ""} className="select select-sm w-36" aria-label={t("状态", "Status")}>
          <option value="">{t("全部状态", "All statuses")}</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s, lang, { short: true }).text}
            </option>
          ))}
        </select>
        <select name="sort" defaultValue={sort} data-default={defaultSort} className="select select-sm w-44" aria-label={t("排序", "Sort")}>
          {Object.entries(sortLabels(lang)).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {PAGE_SIZE !== defaultSize && <input type="hidden" name="size" value={PAGE_SIZE} />}
      </FilterBar>

      {error && (
        <div role="alert" className="alert alert-error alert-soft">
          {t("查 Marzban 出错：", "Marzban error: ")}
          {error}
        </div>
      )}

      {data && (
        <div className="overflow-x-auto">
          <ResizableTable id="subscriptions" className="table table-sm">
            <thead>
              <tr>
                <th>{t("订阅（Marzban 用户名）", "Subscription (Marzban user)")}</th>
                <th>{t("微信号", "WeChat")}</th>
                <th>{t("邮箱", "Email")}</th>
                <th>{t("套餐", "Plan")}</th>
                <th>{t("状态", "Status")}</th>
                <th>{t("到期", "Expires")}</th>
                <th>{t("流量", "Traffic")}</th>
                <th>{t("备注", "Note")}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => {
                const owner = owners.get(u.username);
                const st = statusLabel(u.status, lang, { short: true });
                const online = onlineState(u.online_at, now, lang);
                return (
                  <tr key={u.username} className="hover" data-testid="marzban-user">
                    <td>
                      <div className="flex items-center gap-2 whitespace-nowrap" data-online={online.state}>
                        <span
                          aria-hidden
                          className={`size-2.5 shrink-0 rounded-full ${
                            online.state === "online"
                              ? "bg-success/70"
                              : online.state === "offline"
                                ? "bg-base-content/30"
                                : "border border-base-content/40"
                          }`}
                        />
                        <Link href={`/admin/users/${encodeURIComponent(u.username)}`} className="link link-primary">
                          {u.username}
                        </Link>
                        <span className="text-xs text-base-content/60">{online.text}</span>
                      </div>
                    </td>
                    {/* 微信号、邮箱各一列，点文字就复制。没绑客人的老订阅只有记着的微信号，邮箱那格写「未注册」 */}
                    <td>
                      {owner ? (
                        <CustomerLink id={owner.id} email={owner.email} wechat={owner.wechat} copy part="wechat" />
                      ) : legacyWechat.has(u.username) ? (
                        <span title={t("老订阅，客人还没绑网站账号", "Legacy subscription, not linked to a site account yet")}>
                          <CopyText text={legacyWechat.get(u.username)!} />
                        </span>
                      ) : (
                        <span className="text-base-content/40">-</span>
                      )}
                    </td>
                    <td>
                      {owner ? (
                        <CustomerLink id={owner.id} email={owner.email} wechat={owner.wechat} copy part="email" />
                      ) : legacyWechat.has(u.username) ? (
                        <span className="text-xs whitespace-nowrap text-base-content/50">{t("未注册", "Not registered")}</span>
                      ) : (
                        <span className="text-base-content/40">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{planOf.get(u.username) ?? <span className="text-base-content/40">-</span>}</td>
                    {/* 列多的时候这一格会被挤窄，「正常」「已停用」不能折成一个字一行 */}
                    <td className="whitespace-nowrap">
                      <span className={`badge badge-sm whitespace-nowrap ${st.badge}`}>{st.text}</span>
                    </td>
                    <td className="whitespace-nowrap" title={u.expire && prefs.time === "relative" ? formatExpire(u.expire, lang, tz) : undefined}>
                      {prefs.time === "absolute" ? formatExpire(u.expire, lang, tz) : expireRelative(u.expire, now, lang)}
                    </td>
                    <td className="whitespace-nowrap">
                      {formatBytes(u.used_traffic)} / {u.data_limit ? formatBytes(u.data_limit) : t("不限", "Unlimited")}
                    </td>
                    <td className="max-w-48 truncate text-base-content/60">{u.note || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </ResizableTable>
          {data.users.length === 0 && <p className="py-4 text-sm text-base-content/60">{t("没有符合条件的订阅。", "No matching subscriptions.")}</p>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-4">
              <PageSize size={PAGE_SIZE} />
              <span className="text-base-content/60">
                {t(`共 ${data.total} 个，第 ${page} / ${pages} 页`, `${data.total} total · page ${page} of ${pages}`)}
              </span>
            </div>
            <div className="join">
              {page > 1 && (
                <Link href={href(page - 1)} className="btn btn-sm join-item">
                  {t("上一页", "Previous")}
                </Link>
              )}
              {page < pages && (
                <Link href={href(page + 1)} className="btn btn-sm join-item">
                  {t("下一页", "Next")}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      <div className="mt-8">
        <BulkActions />
      </div>
    </div>
  );
}
