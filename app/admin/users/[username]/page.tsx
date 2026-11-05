import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { findUser, userUsage, type MarzbanUser } from "@/lib/marzban";
import { formatBytes, formatExpire, formatSubCode, resetLabel, statusLabel, timeLeft } from "@/lib/format";
import { monthStartBeijing, onlineText, toBeijingInput } from "@/lib/admin-users";
import AdminHeader from "../../AdminHeader";
import { adminEditUser } from "../../actions";
import UserForm from "../UserForm";
import UserActions from "./UserActions";
import PlanCard from "./PlanCard";
import { describePlan, findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import { pick } from "@/lib/i18n";
import BindToCustomer from "./BindToCustomer";
import CopyButton from "../../CopyButton";
import BindButton from "../../BindButton";
import { CustomerLink } from "../../Links";
import CopyCode from "../../../dashboard/CopyCode";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

// 一个 Marzban 用户：看状态、改流量/到期/状态/备注、清零流量、重置订阅链接、删除。都是直接改 Marzban
export default async function UserPage({ params }: { params: Promise<{ username: string }> }) {
  const admin = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
  const username = decodeURIComponent((await params).username);
  let user: MarzbanUser | null;
  try {
    user = await findUser(username);
  } catch (e) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-16">
        <AdminHeader email={admin.email} />
        <div role="alert" className="alert alert-error alert-soft mt-4">
          {t("查 Marzban 出错：", "Marzban error: ")}
          {e instanceof Error ? e.message : String(e)}
        </div>
      </div>
    );
  }
  if (!user) notFound();

  const owner = await db()
    .prepare("SELECT c.id, c.email, c.wechat FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.marzban_username = ?")
    .bind(username)
    .first<{ id: number; email: string; wechat: string | null }>();
  // 本月在各节点用的流量；查不到不影响页面
  const usage = await userUsage(username, monthStartBeijing(Date.now()), new Date())
    .then((r) => r.usages.filter((u) => u.used_traffic > 0).sort((a, b) => b.used_traffic - a.used_traffic))
    .catch(() => null);
  // 没绑客人时：看它是不是老订阅（记着微信号），有没有同微信号的注册客人
  const legacy = owner
    ? null
    : await db()
        .prepare(
          `SELECT w.wechat, m.id AS match_id, m.email AS match_email FROM marzban_users w
           LEFT JOIN customers m ON m.id = (SELECT id FROM customers x WHERE x.wechat = w.wechat COLLATE NOCASE ORDER BY id LIMIT 1)
           WHERE w.marzban_username = ? AND w.wechat IS NOT NULL`,
        )
        .bind(username)
        .first<{ wechat: string; match_id: number | null; match_email: string | null }>();
  // 订阅编号（客人订阅页上那个 7F3A-9C21）；后台手动建、没绑客人的订阅没有
  const code = (await db().prepare("SELECT code FROM subscriptions WHERE marzban_username = ?").bind(username).first<{ code: string | null }>())?.code;
  const planRow = await db().prepare("SELECT plan_id FROM marzban_users WHERE marzban_username = ? AND plan_id IS NOT NULL").bind(username).first<{ plan_id: string }>();
  // 套餐说明：价目表上那行（比如「单设备  20G流量/月」），没配就写流量
  const desc = (id: string) => {
    const p = findPlan(site.plans, id)!;
    const line = site.planGroups?.[p.group ?? p.name]?.lines?.at(-1);
    return line ? pick(line, lang) : describePlan(p, lang);
  };
  const currentPlan = planRow && findPlan(site.plans, planRow.plan_id) ? { id: planRow.plan_id, name: findPlan(site.plans, planRow.plan_id)!.name, desc: desc(planRow.plan_id) } : null;
  const planOptions = site.plans.map((p) => ({ id: p.id, name: p.name, desc: desc(p.id) }));
  const st = statusLabel(user.status, lang);
  const left = timeLeft(user.expire, undefined, lang);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Link href="/admin/users" className="link link-hover text-sm text-base-content/60">
        ← {t("订阅列表", "Subscriptions")}
      </Link>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">{user.username}</h1>
        <span className={`badge ${st.badge}`}>{st.text}</span>
        {code && (
          <span className="text-sm text-base-content/60">
            {t("订阅编号", "Code")} <b className="font-mono text-base-content"><CopyCode text={formatSubCode(code)} /></b>
          </span>
        )}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" data-testid="sub-owner">
        <span className="text-base-content/60">{t("属于客人", "Customer")}</span>
        {owner ? (
          <CustomerLink id={owner.id} email={owner.email} wechat={owner.wechat} />
        ) : legacy?.match_id ? (
          <>
            <span>
              {t("微信", "WeChat")} <b>{legacy.wechat}</b>
              {t("，同微信号的客人", "; customer with the same WeChat ID:")}
            </span>
            <CustomerLink id={legacy.match_id} email={legacy.match_email ?? ""} />
            <BindButton customerId={legacy.match_id} username={user.username} who={legacy.match_email ?? ""} />
          </>
        ) : legacy ? (
          <span className="inline-flex items-center">
            {t("微信", "WeChat")} <b className="ml-1">{legacy.wechat}</b>
            <CopyButton text={legacy.wechat} label={t("复制微信号", "Copy WeChat ID")} />
            {t("（还没注册网站账号）", "(no site account yet)")}
          </span>
        ) : (
          <span className="text-base-content/50">{t("没绑", "Not linked")}</span>
        )}
        <span className="text-base-content/40">｜</span>
        <span className="text-base-content/60">
          {t("最后连接", "Last seen")} {onlineText(user.online_at, Date.now(), lang)}
        </span>
      </div>
      {!owner && <BindToCustomer username={user.username} wechat={legacy?.wechat} />}

      <div className="mb-4 grid grid-cols-2 gap-4 rounded-box bg-base-100 p-4 shadow-sm">
        <div>
          <div className="text-sm text-base-content/60">{t("到期", "Expires")}</div>
          <div className="font-medium">
            {user.status === "on_hold" && user.on_hold_expire_duration
              ? t(`首次连上后 ${Math.round(user.on_hold_expire_duration / 86400)} 天`, `${Math.round(user.on_hold_expire_duration / 86400)} days after first connection`)
              : formatExpire(user.expire, lang, tz)}
          </div>
          {user.status === "on_hold" ? <div className="text-sm text-base-content/60">{t("还没连过，连上才开始计时", "Not connected yet; the clock starts on first connection")}</div> : left && <div className="text-sm text-base-content/60">{left.text}</div>}
        </div>
        <div>
          <div className="text-sm text-base-content/60">{t("流量", "Traffic")}</div>
          <div className="font-medium">
            {formatBytes(user.used_traffic)} / {user.data_limit ? formatBytes(user.data_limit) : t("不限", "Unlimited")}
          </div>
          <div className="text-sm text-base-content/60">
            {user.data_limit ? (resetLabel(user.data_limit_reset_strategy ?? "", lang) ?? t("不重置", "No reset")) : ""}
            {user.lifetime_used_traffic != null &&
              t(`（累计 ${formatBytes(user.lifetime_used_traffic)}）`, ` (lifetime ${formatBytes(user.lifetime_used_traffic)})`)}
          </div>
        </div>
      </div>

      {usage && (
        <div className="mb-4 rounded-box bg-base-100 p-4 text-sm shadow-sm" data-testid="node-usage">
          <div className="mb-1 text-base-content/60">{t("本月各节点流量", "Traffic by node this month")}</div>
          {usage.length === 0 ? (
            <div className="text-base-content/50">{t("本月还没用过", "No usage this month")}</div>
          ) : (
            <div className="flex flex-col gap-1">
              {usage.map((u) => (
                <div key={u.node_name} className="grid grid-cols-[6rem_1fr_5rem] items-center gap-2">
                  <span className="truncate">{u.node_id === null ? t("面板本机", "Panel (local)") : u.node_name}</span>
                  <progress className="progress progress-primary w-full" value={u.used_traffic} max={usage[0].used_traffic} />
                  <b className="text-right">{formatBytes(u.used_traffic)}</b>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <PlanCard username={user.username} current={currentPlan} options={planOptions} />

      <UserActions username={user.username} url={user.subscription_url} links={user.links ?? []} />

      <h2 className="mt-8 mb-2 text-lg font-bold">{t("修改", "Edit")}</h2>
      <UserForm
        action={adminEditUser}
        username={user.username}
        defaults={{
          dataGB: user.data_limit ? String(Math.round((user.data_limit / 1024 ** 3) * 100) / 100) : "",
          reset: user.data_limit_reset_strategy ?? "no_reset",
          expire: toBeijingInput(user.expire),
          note: user.note ?? "",
          // 到期、流量用完这些是 Marzban 自己算的，表单里只能选启用或停用
          status: user.status === "disabled" ? "disabled" : "active",
        }}
      />
    </div>
  );
}
