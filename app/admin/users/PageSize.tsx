"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PAGE_SIZES } from "@/lib/admin-users";

// 列表底下「每页多少个」，照 Marzban。换了就回到第 1 页
export default function PageSize({ size }: { size: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2">
      <select
        aria-label="每页多少个"
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
      <span className="text-base-content/60">个 / 页</span>
    </label>
  );
}
