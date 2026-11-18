import { requireAdmin } from "@/lib/admin";
import { db, nowSec } from "@/lib/env";
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
import { groupName, planName as planLabel } from "@/lib/plan-text";
import { LOCALE, pick, type Lang, type T } from "@/lib/i18n";

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
  kind: string | null;
  paid_at: number | null;
  created_at: number;
};

const money = (fen: number) => `${site.currency}${formatMoney(fen)}`;
const planName = (t: T, lang: Lang, id: string | null) => {
  const p = id ? findPlan(site.plans, id) : undefined;
  if (p) return planLabel(p, lang);
  return id ? t(`${id}（已下架）`, `${id} (retired)`) : t("（没有套餐）", "(no plan)");
};
// 确认框里用的纯文字
const target = (t: T, o: Row) => (o.kind === "upgrade" ? t(`升级 ${o.marzban_username}（到期不变）`, `Upgrade ${o.marzban_username} (same expiry)`) : o.marzban_username ? t(`续期 ${o.marzban_username}`, `Renew ${o.marzban_username}`) : t("新开订阅", "New subscription"));
// 客人实际要转的钱，抵扣了余额的写在后面
const due = (t: T, o: Row) =>
  `${money(o.amount - o.balance_used)}${
    o.balance_used > 0
      ? t(`（套餐价 ${money(o.amount)}，余额抵扣 ${money(o.balance_used)}）`, ` (plan ${money(o.amount)}, ${money(o.balance_used)} from balance)`)
      : ""
  }`;

const SELECT = `SELECT o.id, o.no, o.kind, c.id AS customer_id, c.email, c.wechat, o.amount, o.balance_used, o.method, o.status, o.plan_id, o.marzban_username,
  o.claimed_at, o.pay_method, o.payer, o.new_sub, o.paid_at, o.created_at FROM orders o JOIN customers c ON c.id = o.customer_id`;

// 客人点「我已付款」的时间精确到秒（北京时间），和账单里的到账时间对
const exact = (lang: Lang, at: number | null) =>
  at === null
    ? "-"
    : new Date(at * 1000).toLocaleString(LOCALE[lang], { timeZone: "Asia/Shanghai", hour12: false }).replace(/\//g, "-");
const who = (o: Row) => <CustomerLink id={o.customer_id} email={o.email} wechat={o.wechat} copy />;
// 付款方式：数据库里存的是中文名（site.payments 的 zh），显示时按后台语言换；颜色按支付宝蓝、微信绿，一眼知道翻哪个账单
const payName = (lang: Lang, method: string | null) => {
  const p = site.payments.find((x) => pick(x.name, "zh") === method);
  return p ? pick(p.name, lang) : (method ?? "-");
};
const payStyle = (method: string | null) =>
  method?.includes("支付宝")
    ? { cls: "bg-[#1677ff]/12 text-[#1677ff]", dot: "bg-[#1677ff]" }
    : method?.includes("微信")
      ? { cls: "bg-[#07c160]/12 text-[#07c160]", dot: "bg-[#07c160]" }
      : { cls: "bg-base-200 text-base-content/70", dot: "bg-base-content/40" };
// 客人点「我已付款」到现在多久了；超过一天算拖久了，卡片标橙
function waited(t: T, at: number | null): { text: string; stale: boolean } {
  if (at === null) return { text: "", stale: false };
  const min = Math.max(0, Math.floor((nowSec() - at) / 60));
  if (min < 60) return { text: t(`${min} 分钟前`, `${min} min ago`), stale: false };
  const h = Math.floor(min / 60);
  if (h < 24) return { text: t(`${h} 小时前`, `${h} h ago`), stale: false };
  const d = Math.floor(h / 24);
  return { text: t(`已等 ${d} 天`, `waiting ${d} d`), stale: true };
}

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
      {/* 对账卡：拿着支付宝 / 微信账单一张张找钱。按对账时看的顺序分层：
          ① 金额 + 付款方式（颜色区分去翻哪个账单）+ 等了多久（超过一天变橙，先处理老的）
          ② 付款人和精确到秒的时间：和账单里那一条对
          ③ 一行灰字：开了什么订阅、套餐、订单号
          ④ 客人联系方式在左，两个小按钮在右。左边一条细色边代替整圈边框，宽屏一行三张 */}
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-xl font-bold">{t("已开通、待对账", "Activated, to reconcile")}</h2>
        {unverified.length > 0 && (
          <span className="text-sm text-base-content/50">
            {t(`${unverified.length} 张 · 共 `, `${unverified.length} · total `)}
            <b className="text-base-content/80">{money(unverified.reduce((sum, o) => sum + o.amount - o.balance_used, 0))}</b>
          </span>
        )}
      </div>
      {unverified.length === 0 && <p className="text-base-content/60">{t("没有要对账的单。", "Nothing to reconcile.")}</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {unverified.map((o) => {
          const summary = `${t("订单", "Order")} ${formatOrderNo(o.no)}｜${o.email}｜${planName(t, lang, o.plan_id)}｜${o.marzban_username}｜${t("应收", "Due")} ${money(o.amount - o.balance_used)}｜${o.pay_method ?? "?"}`;
          const wait = waited(t, o.claimed_at);
          const pay = payStyle(o.pay_method);
          return (
            <div
              key={o.id}
              className={`group relative flex flex-col gap-3 overflow-hidden rounded-box bg-base-100 py-3 pr-3 pl-4 text-sm shadow-sm ring-1 ring-base-300/60 transition hover:shadow-md`}
              data-testid="unverified-order"
            >
              <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${wait.stale ? "bg-warning" : "bg-info/70"}`} />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-2xl leading-none font-bold tabular-nums tracking-tight">{money(o.amount - o.balance_used)}</div>
                  {o.balance_used > 0 && (
                    <div className="mt-1 text-xs text-base-content/50">{t(`另有余额抵扣 ${money(o.balance_used)}`, `+ ${money(o.balance_used)} from balance`)}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${pay.cls}`}>
                    <span aria-hidden className={`size-1.5 rounded-full ${pay.dot}`} />
                    {payName(lang, o.pay_method)}
                  </span>
                  <span className={`text-xs ${wait.stale ? "font-medium text-warning" : "text-base-content/50"}`}>{wait.text}</span>
                </div>
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                <dt className="text-base-content/50">{t("付款人", "Payer")}</dt>
                <dd className="font-medium">{o.payer ?? <span className="font-normal text-base-content/40">{t("没填", "not given")}</span>}</dd>
                <dt className="text-base-content/50">{t("点已付款", "Marked paid")}</dt>
                <dd className="font-mono tabular-nums">{exact(lang, o.claimed_at)}</dd>
              </dl>

              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-base-content/60">
                <span className="badge badge-xs badge-ghost gap-1 py-2 font-medium">
                  {o.new_sub ? t("新开", "New") : o.kind === "upgrade" ? t("升级", "Upgrade") : t("续期", "Renewal")} {o.marzban_username && <SubLink username={o.marzban_username} />}
                </span>
                <span>{planName(t, lang, o.plan_id)}</span>
                <span className="text-base-content/30">·</span>
                <span className="font-mono">
                  {t("订单", "Order")} {formatOrderNo(o.no)}
                </span>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-2 border-t border-base-300/60 pt-2">
                <div className="flex min-w-0 flex-col text-xs">
                  <CustomerLink id={o.customer_id} email={o.email} wechat={o.wechat} copy />
                </div>
                <VerifyActions id={o.id} summary={summary} isNew={!!o.new_sub} />
              </div>
            </div>
          );
        })}
      </div>

      {/* 卡住的、客人还没付的单：没有就整块不显示 */}
      {open.length > 0 && (
        <>
      <h2 className="mt-10 mb-3 text-xl font-bold">{t("待处理的订单", "Orders to handle")}</h2>
      <div className="grid gap-3 lg:grid-cols-2">
        {open.map((o) => {
          const stuck = o.status === "processing";
          const summary = `${t("订单", "Order")} ${formatOrderNo(o.no)}｜${o.email}｜${planName(t, lang, o.plan_id)}｜${target(t, o)}｜${t("应收", "Due")} ${money(o.amount - o.balance_used)}`;
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
                  {who(o)}｜{planName(t, lang, o.plan_id)}｜
                  {o.marzban_username ? (
                    <>
                      {o.kind === "upgrade" ? t("升级", "Upgrade") : t("续期", "Renew")} {sub(o)}
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
        </>
      )}
    </div>
  );
}
