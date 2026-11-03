// 套餐在页面上怎么叫：中英文的套餐名、档位名、周期（月付 / Monthly）
import { site } from "@/site.config";
import type { Plan } from "@/site.config.example";
import { makeT, pick, type Lang } from "./i18n";

export function planName(p: Plan, lang: Lang): string {
  return lang === "en" && p.en ? p.en : p.name;
}

export const groupOf = (p: Plan) => p.group ?? p.name;

// 档位名：planGroups 里写了 name 用它，没写就用 Plan.group
export function groupName(group: string, lang: Lang): string {
  const name = site.planGroups?.[group]?.name;
  return name ? pick(name, lang) : group;
}

// 价目表的列名和价格后面的单位：按天数算，不靠套餐名
export function periodLabel(days: number, lang: Lang): { label: string; per: string } {
  const t = makeT(lang);
  if (days >= 28 && days <= 31) return { label: t("月付", "Monthly"), per: t("/月", "/mo") };
  if (days >= 85 && days <= 95) return { label: t("季付", "Quarterly"), per: t("/季", "/qtr") };
  if (days >= 175 && days <= 185) return { label: t("半年付", "6 months"), per: t("/半年", "/6 mo") };
  if (days >= 360 && days <= 370) return { label: t("年付", "Yearly"), per: t("/年", "/yr") };
  return { label: t(`${days} 天`, `${days} days`), per: "" };
}
