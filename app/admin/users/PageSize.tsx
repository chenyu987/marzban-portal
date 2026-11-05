"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES } from "@/lib/admin-users";
import { useT } from "../../LangContext";

// 列表底下「每页多少个」，照 Marzban。换了就回到第 1 页
export default function PageSize({ size }: { size: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useT();
  return (
    <label className="flex items-center gap-2">
      <select
        aria-label={t("每页多少个", "Per page")}
        className="select select-sm w-20"
        value={size}
        onChange={(e) => {
          const qs = new URLSearchParams(params);
          qs.set("size", e.target.value);
          qs.delete("page");
          router.push(`${pathname}?${qs}`);
        }}
      >
        {PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="text-base-content/60">{t("个 / 页", "per page")}</span>
    </label>
  );
}
