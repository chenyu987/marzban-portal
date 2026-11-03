"use client";

import Link from "next/link";
import { useState } from "react";
import { useT } from "./LangContext";

export type PricingGroup = {
  name: string;
  desc: string;
  badge: "hot" | "top" | null;
  // 按周期排好（月付、季付、半年付、年付）。price、perMonth、save 都是带币种的字符串
  plans: { label: string; per: string; price: string; perMonth: string | null; save: string | null }[];
};

// 首页价格卡：上面切月付 / 季付 / 半年付 / 年付，卡片跟着换价格，写明折合每月多少、比按月买省多少
export default function PricingCards({
  groups,
  periods,
  defaultPeriod,
  href,
  cta,
}: {
  groups: PricingGroup[];
  periods: string[];
  defaultPeriod: number;
  href: string;
  cta: string;
}) {
  const [period, setPeriod] = useState(defaultPeriod);
  const t = useT();
  return (
    <>
      <div role="tablist" className="tabs tabs-box mx-auto mt-8 w-fit">
        {periods.map((label, i) => (
          <button key={label} type="button" role="tab" aria-selected={i === period} className={`tab ${i === period ? "tab-active" : ""}`} onClick={() => setPeriod(i)}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="pricing">
        {groups.map((g) => {
          const p = g.plans[period] ?? g.plans[0];
          const hot = g.badge === "hot";
          return (
            <div key={g.name} className={`relative flex flex-col rounded-box bg-base-100 p-6 shadow-sm ${hot ? "ring-2 ring-primary" : "border border-base-300/70"}`}>
              {g.badge && (
                <span className={`badge absolute -top-3 left-6 ${hot ? "badge-primary" : "badge-accent"}`}>
                  {hot ? t("最受欢迎", "Most popular") : t("旗舰", "Flagship")}
                </span>
              )}
              <h3 className="text-lg font-bold">{g.name}</h3>
              <p className="mt-1 text-sm text-base-content/60">{g.desc}</p>
              <div className="mt-4">
                <span className="text-4xl font-extrabold">{p.price}</span>
                <span className="text-base-content/60"> {p.per}</span>
              </div>
              <p className="mt-1 min-h-5 text-sm">
                {p.perMonth && <span className="text-base-content/60">{t(`折合 ${p.perMonth}/月`, `${p.perMonth}/mo`)}</span>}
                {p.save && <span className="ml-2 text-success">{t(`比按月买省 ${p.save}`, `Save ${p.save} vs monthly`)}</span>}
              </p>
              <div className="flex-1" />
              <Link href={href} className={`btn mt-6 ${hot ? "btn-primary" : "btn-outline"}`}>
                {cta}
              </Link>
            </div>
          );
        })}
      </div>
    </>
  );
}
