"use client";

import { useEffect, useState } from "react";
import { useLang, useT } from "../LangContext";
import { useSite } from "../SiteContext";
import { referralInvite } from "@/lib/referral-invite";

// 每个朋友一行：谁、哪天加入、一共给你返了多少；点开看他每一笔付款返了多少（以前「已推荐」和「奖励明细」两张表，同一个人出现两次）
export type Referral = { id: number; name: string; createdAt: string; earned: string; rewards: { date: string; paid: string; reward: string }[] };

// 推荐链接用当前访问的域名拼，换域名或者在本地测试都不用改配置
// reserved：抵扣在还没付款的单上的余额，没有是 null；totalEarned：推荐一共返了多少
type Props = { code: string; referrals: Referral[]; balance: string; reserved: string | null; totalEarned: string };

export default function ReferralCard({ code, referrals, balance, reserved, totalEarned }: Props) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | "invite" | null>(null);
  const t = useT();
  const lang = useLang();
  const { brand } = useSite();

  useEffect(() => setLink(`${window.location.origin}/register?ref=${code}`), [code]);

  async function copy(what: "code" | "link" | "invite") {
    await navigator.clipboard.writeText(what === "code" ? code : what === "link" ? link : referralInvite(brand, link, code, lang));
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="card bg-base-100 shadow-sm" data-testid="referral-card">
      <div className="card-body gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="card-title">{t("邀请朋友", "Invite friends")}</h2>
            <p className="mt-1 text-sm text-base-content/60">
              {t("朋友用你的推荐码注册，之后他每付一笔款，你都拿 10%，记进余额。", "Friends who sign up with your code earn you 10% of every payment they make, added to your balance.")}
            </p>
          </div>
          <span className="badge badge-soft badge-success shrink-0 font-semibold">{t("返 10%", "10% back")}</span>
        </div>

        {/* 推荐码点一下就复制。主操作是「复制推荐邀请」：一整段话，带链接和从注册到用上的几步，直接发给朋友；只要链接的用「复制推荐链接」 */}
        <div className="rounded-box border border-dashed border-base-300 p-4">
          <div className="text-xs text-base-content/50">{t("我的推荐码", "My referral code")}</div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <code
              role="button"
              tabIndex={0}
              title={t("点击复制", "Click to copy")}
              onClick={() => copy("code")}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), copy("code"))}
              className="cursor-pointer font-mono text-2xl font-bold tracking-[0.2em]"
              data-testid="referral-code"
            >
              {copied === "code" ? t("已复制 ✓", "Copied ✓") : code}
            </code>
            <div className="flex gap-2">
              <button type="button" onClick={() => copy("link")} className="btn btn-ghost btn-sm" disabled={!link}>
                {copied === "link" ? t("已复制 ✓", "Copied ✓") : t("复制推荐链接", "Copy link")}
              </button>
              <button type="button" onClick={() => copy("invite")} className="btn btn-primary btn-sm" disabled={!link}>
                {copied === "invite" ? t("已复制 ✓", "Copied ✓") : t("复制推荐邀请", "Copy invite")}
              </button>
            </div>
          </div>
        </div>

        {/* 三个数：余额（能直接抵扣）、邀请了几个人、一共返了多少 */}
        <div className="grid grid-cols-3 divide-x divide-base-200 rounded-box bg-base-200/60 py-3 text-center">
          <div>
            <div className="text-xs text-base-content/50">{t("余额", "Balance")}</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums" data-testid="balance">{balance}</div>
          </div>
          <div>
            <div className="text-xs text-base-content/50">{t("已邀请", "Invited")}</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">
              {referrals.length}
              <span className="ml-0.5 text-xs font-normal text-base-content/50">{t("人", "")}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-base-content/50">{t("累计返利", "Earned")}</div>
            <div className="mt-0.5 text-lg font-bold text-success tabular-nums">{totalEarned}</div>
          </div>
        </div>
        <p className="-mt-3 text-xs text-base-content/50">
          {t("买套餐、续费时余额直接抵扣。", "Your balance is applied automatically when you buy or renew.")}
          {reserved && (
            <span className="block" data-testid="balance-reserved">
              {t(
                `其中 ${reserved} 抵扣在还没付款的订单上，付款后才扣；不要了在「购买/续费」里取消就行。`,
                `${reserved} of it is applied to an unpaid order and only deducted once you pay; cancel the order under Buy / Renew if you don't need it.`,
              )}
            </span>
          )}
        </p>

        {referrals.length > 0 && (
          <ul className="-mx-2" data-testid="referrals">
            {referrals.map((r) => (
              <li key={r.id}>
                <details className="group rounded-box px-2 open:bg-base-200/50">
                  <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary" aria-hidden>
                      {r.name.replace(/^微信\s*/, "").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{r.name}</span>
                      <span className="block text-xs text-base-content/50">{t(`${r.createdAt} 加入`, `Joined ${r.createdAt}`)}</span>
                    </span>
                    <span className={`text-sm font-semibold tabular-nums ${r.rewards.length ? "text-success" : "text-base-content/40"}`}>
                      {r.rewards.length ? `+${r.earned}` : t("还没付款", "No payments yet")}
                    </span>
                    {r.rewards.length > 0 && (
                      <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-base-content/40 transition-transform group-open:rotate-180" aria-hidden>
                        <path fill="currentColor" d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
                      </svg>
                    )}
                  </summary>
                  {r.rewards.length > 0 && (
                    <ul className="mb-2 ml-11 space-y-1 border-l border-base-300 pl-3 text-xs text-base-content/60">
                      {r.rewards.map((w, i) => (
                        <li key={i} className="flex justify-between gap-3 tabular-nums">
                          <span>
                            {w.date} {t("付款", "paid")} {w.paid}
                          </span>
                          <span className="text-success">+{w.reward}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
