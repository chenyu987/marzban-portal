import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire, formatMoney, formatOrderNo } from "@/lib/format";
import { findPlan } from "@/lib/plans";
import { site } from "@/site.config";
import AdminHeader from "./AdminHeader";
import Overview from "./Overview";
import OrdersTable from "./OrdersTable";
import { Tabs } from "./ui";
import { CustomerLink, SubLink } from "./Links";
import OrderActions from "./OrderActions";
import VerifyActions from "./VerifyActions";
import { getTz } from "@/lib/tz-server";
import { getT } from "@/lib/lang";
import { LOCALE, type Lang, type T } from "@/lib/i18n";

export const dynamic = "force-dynamic";

type Row = {
  id: number;
  no: string | null;
  customer_id: number;
  email: string;
  wechat: string | null;
  amount: number;
  balance_used: number;
  method: string;
  status: string;
  plan_id: string | null;
  marzban_username: string | null;
  claimed_at: number | null;
  pay_method: string | null;
  payer: string | null;
  new_sub: number | null;
  paid_at: number | null;
  created_at: number;
};

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const planName = (t: T, id: string | null) =>
  id ? (findPlan(site.plans, id)?.name ?? t(`${id}（已下架）`, `${id} (retired)`)) : t("（没有套餐）", "(no plan)");
// 确认框里用的纯文字
const target = (t: T, o: Row) => (o.marzban_username ? t(`续期 ${o.marzban_username}`, `Renew ${o.marzban_username}`) : t("新开订阅", "New subscription"));
// 客人实际要转的钱，抵扣了余额的写在后面
const due = (t: T, o: Row) =>
  `${money(o.amount - o.balance_used)}${
    o.balance_used > 0
      ? t(`（套餐价 ${money(o.amount)}，余额抵扣 ${money(o.balance_used)}）`, ` (plan ${money(o.amount)}, ${money(o.balance_used)} from balance)`)
      : ""
  }`;

const SELECT = `SELECT o.id, o.no, c.id AS customer_id, c.email, c.wechat, o.amount, o.balance_used, o.method, o.status, o.plan_id, o.marzban_username,
  o.claimed_at, o.pay_method, o.payer, o.new_sub, o.paid_at, o.created_at FROM orders o JOIN customers c ON c.id = o.customer_id`;

// 客人点「我已付款」的时间精确到秒（北京时间），和账单里的到账时间对
const exact = (lang: Lang, at: number | null) =>
  at === null
    ? "-"
    : new Date(at * 1000).toLocaleString(LOCALE[lang], { timeZone: "Asia/Shanghai", hour12: false }).replace(/\//g, "-");
const who = (o: Row) => <CustomerLink id={o.customer_id} email={o.email} wechat={o.wechat} />;

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const tz = await getTz();
  const { t, lang } = await getT();
  const sub = (o: Row) => (o.marzban_username ? <SubLink username={o.marzban_username} /> : t("新开订阅", "New subscription"));
  const sp = await searchParams;
  const view = sp.view === "all" ? "all" : "todo";
  // 开通中的（出过问题，要核对）排最前，然后是客人说已付的（按点的时间），最后是还没付的
  const [{ results: open }, { results: unverified }] = await Promise.all([
    db()
      .prepare(
        `${SELECT} WHERE o.method IN ('transfer', 'balance') AND o.status IN ('pending', 'processing')
         ORDER BY o.status = 'processing' DESC, o.claimed_at IS NULL, o.claimed_at, o.id`,
      )
      .all<Row>(),
    // 先开通后对账：客人点了「我已付款」已经开通，等管理员去账单里对
    db()
      .prepare(`${SELECT} WHERE o.method = 'transfer' AND o.status = 'paid' AND o.verified_at IS NULL ORDER BY o.claimed_at, o.id`)
      .all<Row>(),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <Overview pending={open.length + unverified.length} />

      <h1 className="mt-6 mb-2 text-2xl font-bold">{t("订单", "Orders")}</h1>
      <Tabs
        tabs={[
          { href: "/admin", label: t("待处理", "To do"), count: open.length + unverified.length, active: view === "todo" },
          { href: "/admin?view=all", label: t("全部订单", "All orders"), active: view === "all" },
        ]}
      />
      {view === "all" ? (
        <OrdersTable sp={sp} />
      ) : (
        <>
      <h2 className="mb-1 text-xl font-bold">{t("已开通、待对账", "Activated, to reconcile")}</h2>
      <p className="mb-4 text-sm text-base-content/60">
        {t(
          "客人付完款点「我已付款」就自动开通了。按点的时间、金额、付款方式和付款人去账单里找这笔钱：找到了点「确认到账」，找不到点「没收到钱」把订阅收回。",
          "Orders activate as soon as the customer taps “I've paid”. Look for the payment in your statement by time, amount, method and payer: if it's there, tap “Confirm received”; if not, tap “Not received” to revoke the subscription.",
        )}
      </p>
      {unverified.length === 0 && <p className="text-base-content/60">{t("没有要对账的单。", "Nothing to reconcile.")}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {unverified.map((o) => {
          const summary = `${t("订单", "Order")} ${formatOrderNo(o.no)}｜${o.email}｜${planName(t, o.plan_id)}｜${o.marzban_username}｜${t("应收", "Due")} ${money(o.amount - o.balance_used)}｜${o.pay_method ?? "?"}`;
          return (
            <div key={o.id} className="card border border-info bg-base-100 shadow-sm" data-testid="unverified-order">
              <div className="card-body gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {t("订单", "Order")} {formatOrderNo(o.no)}
                  </span>
                  <span className="badge badge-info gap-1">
                    {o.new_sub ? t("新开", "New") : t("续期", "Renewal")} {o.marzban_username && <SubLink username={o.marzban_username} />}
                  </span>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <span className="text-base-content/60">{t("应收", "Due")}</span>
                  <b>{due(t, o)}</b>
                  <span className="text-base-content/60">{t("付款方式", "Method")}</span>
                  <span>{o.pay_method ?? "-"}</span>
                  <span className="text-base-content/60">{t("付款人", "Payer")}</span>
                  <span>{o.payer ?? t("（没填）", "(not given)")}</span>
                  <span className="text-base-content/60">{t("点已付款", "Marked paid")}</span>
                  <span>{exact(lang, o.claimed_at)}</span>
                  <span className="text-base-content/60">{t("客人", "Customer")}</span>
                  <span>{who(o)}</span>
                  <span className="text-base-content/60">{t("套餐", "Plan")}</span>
                  <span>{planName(t, o.plan_id)}</span>
                </div>
                <VerifyActions id={o.id} summary={summary} isNew={!!o.new_sub} />
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-10 mb-1 text-xl font-bold">{t("待处理的订单", "Orders to handle")}</h2>
      <p className="mb-4 text-sm text-base-content/60">
        {t(
          "客人点了「我已付款」但自动开通没成功的会留在这里，在账单里找到这笔钱再确认开通。没点「我已付款」的一般就是还没付。",
          "Orders where the customer tapped “I've paid” but automatic activation failed stay here: find the payment in your statement, then confirm. Orders without “I've paid” usually just haven't been paid yet.",
        )}
      </p>
      {open.length === 0 && <p className="text-base-content/60">{t("没有待处理的订单。", "No orders to handle.")}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {open.map((o) => {
          const stuck = o.status === "processing";
          const summary = `${t("订单", "Order")} ${formatOrderNo(o.no)}｜${o.email}｜${planName(t, o.plan_id)}｜${target(t, o)}｜${t("应收", "Due")} ${money(o.amount - o.balance_used)}`;
          return (
            <div key={o.id} className={`card bg-base-100 shadow-sm ${stuck ? "border border-error" : o.claimed_at ? "border border-warning" : ""}`}>
              <div className="card-body gap-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {t("订单", "Order")} {formatOrderNo(o.no)}
                  </span>
                  <span className={`badge ${stuck ? "badge-error" : o.claimed_at ? "badge-warning" : "badge-ghost"}`}>
                    {stuck
                      ? t(`开通中，需要核对${o.method === "balance" ? "（余额付款）" : ""}`, `Provisioning, needs checking${o.method === "balance" ? " (paid with balance)" : ""}`)
                      : o.claimed_at
                        ? t(
                            `客人 ${exact(lang, o.claimed_at)} 说已付（${o.pay_method ?? "?"}${o.payer ? `，${o.payer}` : ""}），自动开通失败`,
                            `Marked paid at ${exact(lang, o.claimed_at)} (${o.pay_method ?? "?"}${o.payer ? `, ${o.payer}` : ""}); automatic activation failed`,
                          )
                        : t("还没付", "Not paid yet")}
                  </span>
                </div>
                <div className="text-sm">
                  {who(o)}｜{planName(t, o.plan_id)}｜
                  {o.marzban_username ? (
                    <>
                      {t("续期", "Renew")} {sub(o)}
                    </>
                  ) : (
                    t("新开订阅", "New subscription")
                  )}
                </div>
                <div className="text-sm">
                  {t("应收", "Due")} <b>{due(t, o)}</b>
                  {t(`，${formatExpire(o.created_at, lang, tz)} 下单`, `, ordered ${formatExpire(o.created_at, lang, tz)}`)}
                </div>
                {stuck ? (
                  <p className="text-sm text-error">
                    {t("上次开通出了问题，不确定 Marzban 改没改。", "The last activation failed and it's unclear whether Marzban was changed. ")}
                    {o.marzban_username ? (
                      <>
                        {t("先点", "First open")} {sub(o)} {t("看它现在的到期和流量，", "to check its current expiry and traffic, ")}
                      </>
                    ) : (
                      t("先去「订阅」页按客人的微信号搜一下有没有新开出来，", "First search the Subscriptions page by the customer's WeChat ID to see whether one was created, ")
                    )}
                    {t("再用命令行处理：", "then finish from the command line: ")}npm run orders -- confirm {formatOrderNo(o.no)} --done {t("订阅名", "<username>")} --remote
                    {t("（已经改好）或 --again（确实没改）", " (already changed) or --again (not changed)")}
                  </p>
                ) : (
                  o.method === "transfer" && <OrderActions id={o.id} summary={summary} />
                )}
              </div>
            </div>
          );
        })}
      </div>

        </>
      )}
    </div>
  );
}
