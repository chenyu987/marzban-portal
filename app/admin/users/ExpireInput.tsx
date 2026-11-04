"use client";

import { useState } from "react";

// 到期时间：选日期（时间默认 23:59，北京时间），旁边几个快捷按钮；空着就是永不到期。
// 以前用 datetime-local，浏览器里清不干净（会剩「11:--」半截），也没法一眼看出「永不到期」
// 提交的还是 expire=YYYY-MM-DDTHH:mm（北京时间），空字符串 = 永不到期，后端不用改
const pad = (n: number) => String(n).padStart(2, "0");
// 今天往后 days 天的北京日期
function beijingDate(days: number): string {
  const d = new Date(Date.now() + 8 * 3600_000 + days * 86400_000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
const QUICK: [string, number][] = [
  ["1 个月", 30],
  ["3 个月", 90],
  ["1 年", 365],
];

export default function ExpireInput({ defaultValue }: { defaultValue: string }) {
  const [date, setDate] = useState(defaultValue.slice(0, 10));
  const [time, setTime] = useState(defaultValue.slice(11, 16) || "23:59");
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="expire" value={date ? `${date}T${time || "23:59"}` : ""} />
      <div className="flex gap-2">
        <input type="date" aria-label="到期日期" value={date} onChange={(e) => setDate(e.target.value)} className="input input-sm min-w-0 flex-1" />
        <input type="time" aria-label="到期时刻" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} className="input input-sm w-28" />
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK.map(([label, days]) => (
          <button key={label} type="button" className="btn btn-xs btn-ghost border-base-300" onClick={() => setDate(beijingDate(days))}>
            {label}后
          </button>
        ))}
        <button type="button" className={`btn btn-xs ${date ? "btn-ghost border-base-300" : "btn-soft btn-primary"}`} onClick={() => setDate("")} aria-pressed={!date}>
          永不到期
        </button>
      </div>
    </div>
  );
}
