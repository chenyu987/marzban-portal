"use client";

import { useEffect, useState } from "react";
import { useT } from "../LangContext";

export type Referral = { email: string; createdAt: string; earned: string };
export type Reward = { email: string; date: string; paid: string; reward: string };

// 推荐链接用当前访问的域名拼，换域名或者在本地测试都不用改配置
type Props = { code: string; referrals: Referral[]; balance: string; rewards: Reward[] };

export default function ReferralCard({ code, referrals, balance, rewards }: Props) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const t = useT();

  useEffect(() => setLink(`${window.location.origin}/register?ref=${code}`), [code]);

  async function copy(what: "code" | "link") {
    await navigator.clipboard.writeText(what === "code" ? code : link);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title">{t("邀请朋友", "Invite friends")}</h2>
        <p className="text-sm text-base-content/70">
          {t(
            "把推荐码或推荐链接发给朋友，朋友注册时填上，就会记在你名下。以后朋友每付一笔款，你都能拿到这笔金额的 10%，记进你的余额。",
            "Send your referral code or link to friends. When they sign up with it, they're linked to you, and you get 10% of every payment they make, added to your balance.",
          )}
        </p>

        <div>
          <div className="text-sm text-base-content/60">{t("我的余额", "My balance")}</div>
          <div className="text-2xl font-bold">{balance}</div>
          <div className="text-sm text-base-content/60">{t("买套餐或续费时，余额可以直接抵扣套餐费用。", "Your balance can be used to pay for plans and renewals.")}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-box bg-base-200 px-3 py-1 text-lg font-bold tracking-widest">{code}</code>
          <button type="button" onClick={() => copy("code")} className="btn btn-sm">
            {copied === "code" ? t("已复制 ✓", "Copied ✓") : t("复制推荐码", "Copy code")}
          </button>
          <button type="button" onClick={() => copy("link")} className="btn btn-sm" disabled={!link}>
            {copied === "link" ? t("已复制 ✓", "Copied ✓") : t("复制推荐链接", "Copy link")}
          </button>
        </div>

        <div>
          <div className="mb-2 text-sm text-base-content/60">
            {t(`已推荐 ${referrals.length} 人`, `${referrals.length} friend${referrals.length === 1 ? "" : "s"} referred`)}
          </div>
          {referrals.length > 0 && (
            <ul className="divide-y divide-base-200 text-sm">
              {referrals.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span>
                    {r.email}
                    <span className="ml-2 text-base-content/60">{t(`${r.createdAt} 注册`, `joined ${r.createdAt}`)}</span>
                  </span>
                  <span>
                    {t("已为你返 ", "Earned you ")}
                    <span className="font-medium text-success">{r.earned}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rewards.length > 0 && (
          <div>
            <div className="mb-2 text-sm text-base-content/60">{t("奖励明细", "Rewards")}</div>
            <ul className="divide-y divide-base-200 text-sm">
              {rewards.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span>
                    {r.email} {t("付款", "paid")} {r.paid}
                  </span>
                  <span>
                    <span className="font-medium text-success">+{r.reward}</span>
                    <span className="ml-2 text-base-content/60">{r.date}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
