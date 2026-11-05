"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TZ, TZ_AUTO, TZ_AUTO_COOKIE, TZ_COOKIE, isValidTz } from "@/lib/timezone";

const cookie = (name: string) => document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];

// 「跟随这台设备」：把浏览器的时区记进 tz_auto cookie，和上次记的不一样（第一次打开、出差换了时区）就刷新一次，
// 服务器下次渲染就按这个时区显示。选了固定时区的不用管
export default function TzSync() {
  const router = useRouter();
  useEffect(() => {
    const chosen = cookie(TZ_COOKIE);
    if (chosen && decodeURIComponent(chosen) !== TZ_AUTO) return;
    let tz: string;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    const saved = cookie(TZ_AUTO_COOKIE);
    if (!tz || (saved && decodeURIComponent(saved) === tz)) return;
    document.cookie = `${TZ_AUTO_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=${365 * 86400}; samesite=lax`;
    // 服务器这次是按哪个时区画的：上次记的，没有就是北京时间。一样就不用刷新
    const rendered = saved && isValidTz(decodeURIComponent(saved)) ? decodeURIComponent(saved) : DEFAULT_TZ;
    if (rendered !== tz) router.refresh();
  }, [router]);
  return null;
}
