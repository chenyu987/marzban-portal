"use client";

import { useEffect, useState } from "react";

export type Referral = { email: string; createdAt: string };
export type Reward = { email: string; date: string; paid: string; reward: string };

// 推荐链接用当前访问的域名拼，换域名或者在本地测试都不用改配置
type Props = { code: string; referrals: Referral[]; balance: string; rewards: Reward[] };

export default function ReferralCard({ code, referrals, balance, rewards }: Props) {
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => setLink(`${window.location.origin}/register?ref=${code}`), [code]);

  async function copy(what: "code" | "link") {
    await navigator.clipboard.writeText(what === "code" ? code : link);
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <h2 className="card-title">邀请朋友</h2>
        <p className="text-sm text-base-content/70">把推荐码或推荐链接发给朋友，朋友注册时填上，就会记在你名下。以后朋友每付一笔款，你都能拿到这笔金额的 10%，记进你的余额。</p>

        <div>
          <div className="text-sm text-base-content/60">我的余额</div>
          <div className="text-2xl font-bold">{balance}</div>
          <div className="text-sm text-base-content/60">余额可以在「购买/续费」里直接买套餐，也可以在下面申请提现到支付宝。</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-box bg-base-200 px-3 py-1 text-lg font-bold tracking-widest">{code}</code>
          <button type="button" onClick={() => copy("code")} className="btn btn-sm">
            {copied === "code" ? "已复制 ✓" : "复制推荐码"}
          </button>
          <button type="button" onClick={() => copy("link")} className="btn btn-sm" disabled={!link}>
            {copied === "link" ? "已复制 ✓" : "复制推荐链接"}
          </button>
        </div>

        <div>
          <div className="mb-2 text-sm text-base-content/60">已推荐 {referrals.length} 人</div>
          {referrals.length > 0 && (
            <ul className="divide-y divide-base-200 text-sm">
              {referrals.map((r, i) => (
                <li key={i} className="flex justify-between py-2">
                  <span>{r.email}</span>
                  <span className="text-base-content/60">{r.createdAt} 注册</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rewards.length > 0 && (
          <div>
            <div className="mb-2 text-sm text-base-content/60">奖励明细</div>
            <ul className="divide-y divide-base-200 text-sm">
              {rewards.map((r, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-x-4 py-2">
                  <span>
                    {r.email} 付款 {r.paid}
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
