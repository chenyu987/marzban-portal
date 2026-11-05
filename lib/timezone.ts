// 时区：页面上的时间（到期时间、下单时间、日志…）按哪个时区显示。客人和管理员在「账户」页选，记在这台设备的 cookie 里。
// 没选（「跟随这台设备」）就用浏览器报的时区（TzSync 记在 tz_auto cookie 里）；第一次打开还不知道时按北京时间。
// 提醒邮件、后台填到期时间的输入框、「本月」统计这些照旧按北京时间
export const TZ_COOKIE = "tz";
export const TZ_AUTO_COOKIE = "tz_auto";
export const TZ_AUTO = "auto";
export const DEFAULT_TZ = "Asia/Shanghai";

// 账户页列出来的常用时区（客人和节点在哪就列哪），别的时区「跟随这台设备」也能显示
export const TIMEZONES: { id: string; zh: string; en: string }[] = [
  { id: "Asia/Shanghai", zh: "北京时间", en: "Beijing" },
  { id: "Asia/Hong_Kong", zh: "香港", en: "Hong Kong" },
  { id: "Asia/Taipei", zh: "台北", en: "Taipei" },
  { id: "Asia/Singapore", zh: "新加坡", en: "Singapore" },
  { id: "Asia/Tokyo", zh: "东京", en: "Tokyo" },
  { id: "Asia/Seoul", zh: "首尔", en: "Seoul" },
  { id: "Australia/Sydney", zh: "悉尼", en: "Sydney" },
  { id: "Europe/London", zh: "伦敦", en: "London" },
  { id: "Europe/Paris", zh: "巴黎 / 柏林", en: "Paris / Berlin" },
  { id: "America/New_York", zh: "美东（纽约）", en: "US Eastern (New York)" },
  { id: "America/Chicago", zh: "美中（芝加哥）", en: "US Central (Chicago)" },
  { id: "America/Los_Angeles", zh: "美西（洛杉矶 / 西雅图）", en: "US Pacific (LA / Seattle)" },
  { id: "America/Toronto", zh: "多伦多", en: "Toronto" },
  { id: "America/Vancouver", zh: "温哥华", en: "Vancouver" },
];

export function isValidTz(tz: string | null | undefined): tz is string {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// 实际用哪个时区：选了就用选的；没选或选了「跟随这台设备」就用浏览器报的；都没有按北京时间
export function resolveTz(chosen: string | null | undefined, auto: string | null | undefined): string {
  if (chosen && chosen !== TZ_AUTO && isValidTz(chosen)) return chosen;
  if (isValidTz(auto)) return auto;
  return DEFAULT_TZ;
}

// 时区给人看的名字：列表里有就用中文名，没有就用 IANA 名（America/Denver）
export function tzLabel(tz: string, lang: "zh" | "en" = "zh"): string {
  const hit = TIMEZONES.find((z) => z.id === tz);
  return hit ? hit[lang] : tz;
}
