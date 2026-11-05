import Link from "next/link";
import { getT } from "@/lib/lang";
import type { T } from "@/lib/i18n";

// 后台列表页共用的几块：筛选栏、结果数和翻页、标签页。所有列表页长得一样，换页面不用重新找按钮

type Params = Record<string, string | undefined>;

// 拼当前页的链接：在现有筛选条件上改几个参数，空值去掉
export function hrefWith(base: string, params: Params, patch: Params = {}): string {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) qs.set(k, v);
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

// 从 searchParams 里取字符串参数
export function param(sp: Record<string, string | string[] | undefined>, key: string): string {
  const v = sp[key];
  return typeof v === "string" ? v.trim() : "";
}

export function pageOf(sp: Record<string, string | string[] | undefined>): number {
  return Math.max(1, Number.parseInt(param(sp, "page"), 10) || 1);
}

// 筛选栏：GET 表单，回车或点「筛选」都提交；有筛选条件时显示「清除」
export async function FilterBar({ base, active, children }: { base: string; active: boolean; children: React.ReactNode }) {
  const { t } = await getT();
  return (
    <form className="mb-3 flex flex-wrap items-center gap-2 rounded-box bg-base-100 p-2 shadow-sm">
      {children}
      <button className="btn btn-sm btn-primary">{t("筛选", "Filter")}</button>
      {active && (
        <Link href={base} className="btn btn-sm btn-ghost">
          {t("清除", "Clear")}
        </Link>
      )}
    </form>
  );
}

// 表格下面：共几条、第几页、上一页下一页
export async function Pager({ base, params, page, pageSize, total }: { base: string; params: Params; page: number; pageSize: number; total: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const { t } = await getT();
  return (
    <div className="mt-3 flex items-center justify-between text-sm">
      <span className="text-base-content/60">
        {t(`共 ${total} 条`, `${total} total`)}
        {pages > 1 ? t(`，第 ${page} / ${pages} 页`, ` · page ${page} of ${pages}`) : ""}
      </span>
      {pages > 1 && (
        <div className="join">
          {page > 1 && (
            <Link href={hrefWith(base, params, { page: String(page - 1) })} className="btn btn-sm join-item">
              {t("上一页", "Previous")}
            </Link>
          )}
          {page < pages && (
            <Link href={hrefWith(base, params, { page: String(page + 1) })} className="btn btn-sm join-item">
              {t("下一页", "Next")}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// 页面顶部的标签页，比如订单的「待处理 / 全部」
export function Tabs({ tabs }: { tabs: { href: string; label: string; count?: number; active: boolean }[] }) {
  return (
    <div role="tablist" className="tabs tabs-border mb-4">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} role="tab" className={`tab gap-1 ${t.active ? "tab-active" : ""}`}>
          {t.label}
          {t.count !== undefined && <span className={`badge badge-sm ${t.count > 0 && t.active === false ? "badge-warning" : ""}`}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

// 状态、付款方式的显示文字跟着后台语言走：orderStatus(t).paid.text
export const orderStatus = (t: T): Record<string, { text: string; badge: string }> => ({
  pending: { text: t("等付款", "Awaiting payment"), badge: "badge-ghost" },
  processing: { text: t("开通中", "Provisioning"), badge: "badge-error" },
  paid: { text: t("已付款", "Paid"), badge: "badge-success" },
  cancelled: { text: t("已取消", "Cancelled"), badge: "badge-neutral" },
  revoked: { text: t("没收到钱，已收回", "Not received, revoked"), badge: "badge-error badge-outline" },
});
export const orderMethod = (t: T): Record<string, string> => ({
  transfer: t("转账", "Transfer"),
  balance: t("余额", "Balance"),
  redeem_code: t("兑换码", "Redeem code"),
  manual: t("手动记账", "Manual entry"),
});
