"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TIMEZONES, TZ_AUTO, TZ_COOKIE, tzLabel } from "@/lib/timezone";
import { useLang } from "./LangContext";

// 「账户」页的时区：跟随这台设备，或者固定一个。记在这台设备上一年，选完刷新一下页面上的时间就换了
export default function TzSwitch({ chosen, device }: { chosen: string; device: string }) {
  const lang = useLang();
  const router = useRouter();
  const [value, setValue] = useState(chosen);
  return (
    <select
      aria-label={lang === "en" ? "Time zone" : "时区"}
      className="select select-sm w-full max-w-xs"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        document.cookie = `${TZ_COOKIE}=${encodeURIComponent(e.target.value)}; path=/; max-age=${365 * 86400}; samesite=lax`;
        router.refresh();
      }}
    >
      <option value={TZ_AUTO}>{lang === "en" ? `This device (${tzLabel(device, lang)})` : `跟随这台设备（${tzLabel(device, lang)}）`}</option>
      {TIMEZONES.map((z) => (
        <option key={z.id} value={z.id}>
          {z[lang]}
        </option>
      ))}
    </select>
  );
}
