// 纯函数，前后端都能用，有单元测试（format.test.ts）

// 从客人粘贴的订阅链接里取出 token。只要 token，不用客人给的域名去请求，
// 免得有人借 portal 去访问任意网址。支持 .../sub/<token>、末尾带 / 或 /<客户端类型>
export function parseSubToken(input: string): string | null {
  const m = /\/sub\/([A-Za-z0-9_\-.=]{10,})(?:\/[A-Za-z-]*)?\/?$/.exec(input.trim().split(/[?#]/)[0]);
  return m ? m[1] : null;
}

export function formatBytes(n: number): string {
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024 ** 3).toFixed(n < 10 * 1024 ** 3 ? 2 : 1)} GB`;
}

// 到期时间按北京时间显示
export function formatExpire(expire: number | null): string {
  if (!expire) return "永不到期";
  return new Date(expire * 1000).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// 剩余时间往下取整，写到小时：「还剩 4 天 7 小时」。和 Marzban 面板的「4 days」对得上，
// 也不会让客人以为比实际多一天。urgent：不到 3 天，页面上标红
export function timeLeft(expire: number | null, nowSec = Date.now() / 1000): { text: string; urgent: boolean } | null {
  if (!expire) return null;
  const sec = expire - nowSec;
  if (sec <= 0) return { text: "已到期", urgent: true };
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const urgent = sec < 3 * 86400;
  if (days === 0) return { text: hours > 0 ? `还剩 ${hours} 小时` : "不到 1 小时", urgent };
  return { text: hours > 0 ? `还剩 ${days} 天 ${hours} 小时` : `还剩 ${days} 天`, urgent };
}

// Marzban 的 data_limit_reset_strategy
export const RESET_LABEL: Record<string, string> = {
  day: "每天重置",
  week: "每周重置",
  month: "每月重置",
  year: "每年重置",
};

export const STATUS_LABEL: Record<string, { text: string; badge: string }> = {
  active: { text: "正常", badge: "badge-success" },
  expired: { text: "已到期", badge: "badge-error" },
  limited: { text: "流量用完", badge: "badge-error" },
  disabled: { text: "已停用", badge: "badge-neutral" },
  on_hold: { text: "未激活", badge: "badge-warning" },
};

export function newReferralCode(): string {
  // 去掉容易看错的 0/O、1/I/L
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}
