// 纯函数，前后端都能用，有单元测试（format.test.ts）。
// 带 lang 参数的是客人页面也用的：不传就是中文（管理后台只有中文）
type Lang = "zh" | "en";
const LOCALE = { zh: "zh-CN", en: "en-US" } as const;

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
// 已经过期的订阅（客人可以在主页隐藏它）：Marzban 标成 expired，或者到期时间已经过了
export function isExpiredSub(user: { status: string; expire: number | null }, nowMs: number): boolean {
  return user.status === "expired" || (!!user.expire && user.expire * 1000 <= nowMs);
}

export function formatExpire(expire: number | null, lang: Lang = "zh"): string {
  if (!expire) return lang === "en" ? "Never" : "永不到期";
  return new Date(expire * 1000).toLocaleString(LOCALE[lang], {
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
// 剩几天以内算「快到期」：订阅页显示续费提醒
export const RENEW_SOON_DAYS = 7;

// 快到期或者已经到期了。永不到期的不用续
export function needsRenewal(expire: number | null, nowSec = Date.now() / 1000): boolean {
  return !!expire && expire - nowSec < RENEW_SOON_DAYS * 86400;
}

// 剩几天以内才放「提前续费」小链接：时间还长的订阅不用提续费。15 天：月付刚买（正好 30 天）不显示，过了一半才出现
export const RENEW_EARLY_DAYS = 15;

export function canRenewEarly(expire: number | null, nowSec = Date.now() / 1000): boolean {
  return !!expire && expire - nowSec <= RENEW_EARLY_DAYS * 86400;
}

export function timeLeft(expire: number | null, nowSec = Date.now() / 1000, lang: Lang = "zh"): { text: string; urgent: boolean } | null {
  if (!expire) return null;
  const en = lang === "en";
  const sec = expire - nowSec;
  if (sec <= 0) return { text: en ? "Expired" : "已到期", urgent: true };
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const urgent = sec < 3 * 86400;
  const d = en ? `${days} day${days === 1 ? "" : "s"}` : `${days} 天`;
  const h = en ? `${hours} hour${hours === 1 ? "" : "s"}` : `${hours} 小时`;
  const left = (x: string) => (en ? `${x} left` : `还剩 ${x}`);
  if (days === 0) return { text: hours > 0 ? left(h) : en ? "Less than 1 hour left" : "不到 1 小时", urgent };
  return { text: hours > 0 ? left(`${d} ${h}`) : left(d), urgent };
}

// Marzban 的 data_limit_reset_strategy
export const RESET_LABEL: Record<string, string> = {
  day: "每天重置",
  week: "每周重置",
  month: "每月重置",
  year: "每年重置",
};

const RESET_LABEL_EN: Record<string, string> = {
  day: "Resets daily",
  week: "Resets weekly",
  month: "Resets monthly",
  year: "Resets yearly",
};

export const resetLabel = (strategy: string, lang: Lang = "zh"): string | undefined =>
  (lang === "en" ? RESET_LABEL_EN : RESET_LABEL)[strategy];

export const STATUS_LABEL: Record<string, { text: string; badge: string }> = {
  active: { text: "正常", badge: "badge-success" },
  expired: { text: "已到期", badge: "badge-error" },
  limited: { text: "流量用完", badge: "badge-error" },
  disabled: { text: "已停用", badge: "badge-neutral" },
  on_hold: { text: "未激活", badge: "badge-warning" },
};

const STATUS_TEXT_EN: Record<string, string> = {
  active: "Active",
  expired: "Expired",
  limited: "Out of data",
  disabled: "Disabled",
  on_hold: "Not activated",
};

export function statusLabel(status: string, lang: Lang = "zh"): { text: string; badge: string } {
  const s = STATUS_LABEL[status] ?? { text: status, badge: "badge-neutral" };
  return lang === "en" ? { ...s, text: STATUS_TEXT_EN[status] ?? status } : s;
}

// 去掉容易看错的 0/O、1/I/L
const REFERRAL_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_LEN = 8;

export function newReferralCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERRAL_LEN));
  return [...bytes].map((b) => REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length]).join("");
}

// 整理客人填的推荐码：忽略大小写、空格和横线，把整条推荐链接粘进来也行（取 ?ref=）。
// 空的返回 ""（没填），格式不对返回 null
export function normalizeReferralCode(input: string): string | null {
  let s = input.trim();
  const ref = /[?&]ref=([^&#]*)/.exec(s);
  if (ref) {
    // 编码坏掉的链接（比如 %E0%A4%A）decodeURIComponent 会抛错，当成格式不对
    try {
      s = decodeURIComponent(ref[1]);
    } catch {
      return null;
    }
  }
  s = s.replace(/[\s-]/g, "").toUpperCase();
  if (!s) return "";
  const re = new RegExp(`^[${REFERRAL_ALPHABET}]{${REFERRAL_LEN}}$`);
  return re.test(s) ? s : null;
}

// 推荐记录里只露出邮箱的一部分：ab***@gmail.com
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 0) return "***";
  const name = email.slice(0, at);
  return `${name.slice(0, name.length > 2 ? 2 : 1)}***${email.slice(at)}`;
}

export function formatDate(sec: number, lang: Lang = "zh"): string {
  return new Date(sec * 1000).toLocaleDateString(LOCALE[lang], {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// 金额在库里都是「分」。显示成 12.30 这样，币种符号由调用方加（在 site.config.ts 里配）
export function formatMoney(fen: number): string {
  const sign = fen < 0 ? "-" : "";
  const abs = Math.abs(fen);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

// 把「元」写的金额（30、30.5、30.50）换成分。不是正数或者超过两位小数返回 null
export function parseYuan(input: string): number | null {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(input.trim());
  if (!m) return null;
  const fen = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return fen > 0 && Number.isSafeInteger(fen) ? fen : null;
}

// 兑换码：16 位，字母表和推荐码一样，约 79 位随机，猜中的可能可以忽略。显示成 4 位一组
const REDEEM_LEN = 16;

export function newRedeemCode(): string {
  // 拒绝采样，每个字符等概率
  const limit = 256 - (256 % REFERRAL_ALPHABET.length);
  let out = "";
  while (out.length < REDEEM_LEN) {
    for (const b of crypto.getRandomValues(new Uint8Array(REDEEM_LEN))) {
      if (b < limit && out.length < REDEEM_LEN) out += REFERRAL_ALPHABET[b % REFERRAL_ALPHABET.length];
    }
  }
  return out;
}

export const formatRedeemCode = (code: string) => code.match(/.{1,4}/g)!.join("-");

// 整理客人填的兑换码：忽略大小写、空格和横线。格式不对返回 null
export function normalizeRedeemCode(input: string): string | null {
  const s = input.replace(/[\s-]/g, "").toUpperCase();
  return s.length === REDEEM_LEN && [...s].every((ch) => REFERRAL_ALPHABET.includes(ch)) ? s : null;
}

// 订阅编号 7F3A9C21 显示成 7F3A-9C21；客服搜的时候带不带横线、大小写都行
export function formatSubCode(code: string | null | undefined): string {
  if (!code) return "-";
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function normalizeSubCode(input: string): string {
  return input.replace(/[^0-9a-z]/gi, "").toUpperCase();
}

// 订单号 26110348213 显示成 261103-48213（前 6 位是下单日期）；搜的时候带不带横线都行
export function formatOrderNo(no: string | null | undefined): string {
  if (!no) return "-";
  return `${no.slice(0, 6)}-${no.slice(6)}`;
}

// 输入像订单号（11 位数字，可以带横线）就返回去掉横线的，不像就返回 null
export function parseOrderNo(input: string): string | null {
  const d = input.replace(/[\s-]/g, "");
  return /^\d{11}$/.test(d) ? d : null;
}
