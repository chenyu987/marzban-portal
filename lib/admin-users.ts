// 后台「用户」页的表单解析和显示用的小函数。只放纯函数，方便单测
import { makeT, type Lang } from "./i18n";

const DAY = 86400;
const GB = 1024 ** 3;

export const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
export const RESET_STRATEGIES = ["no_reset", "day", "week", "month", "year"] as const;
export const STATUS_FILTERS = ["active", "disabled", "limited", "expired", "on_hold"] as const;
// 列表排序：Marzban 的写法，前面加 - 是倒序
export const SORTS: Record<string, string> = {
  "-created_at": "最新建的在前",
  expire: "快到期的在前",
  "-used_traffic": "流量用得多的在前",
  username: "按用户名",
};
const SORTS_EN: Record<string, string> = {
  "-created_at": "Newest first",
  expire: "Expiring soonest",
  "-used_traffic": "Most traffic used",
  username: "By username",
};
export const sortLabels = (lang: Lang = "zh"): Record<string, string> => (lang === "en" ? SORTS_EN : SORTS);

// 写进 Marzban 的字段。expire、data_limit 写 0 表示永不到期、不限流量
export type UserFields = {
  data_limit: number;
  data_limit_reset_strategy: (typeof RESET_STRATEGIES)[number];
  expire: number;
  note: string;
  status: "active" | "disabled";
};

// 后台的时间都按北京时间填：<input type="datetime-local"> 的值是 2026-12-03T02:15 这种，不带时区
export function toBeijingInput(sec: number | null | undefined): string {
  if (!sec) return "";
  return new Date((sec + 8 * 3600) * 1000).toISOString().slice(0, 16);
}

export function fromBeijingInput(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return null;
  const ms = Date.parse(`${v}:00+08:00`);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

// 新建和编辑共用。addDays 只在编辑时有：填了就从原到期时间往后加（已过期从现在算），优先于到期时间
export function parseUserForm(
  get: (key: string) => string,
  opts: { now: number; currentExpire?: number | null },
  lang: Lang = "zh",
): { fields: UserFields } | { error: string } {
  const t = makeT(lang);
  const gb = get("dataGB").trim();
  let data_limit = 0;
  if (gb) {
    const n = Number(gb);
    if (!Number.isFinite(n) || n <= 0) return { error: t("流量要写大于 0 的数（单位 GB），不限流量就留空", "Data limit must be a number above 0 (GB); leave empty for unlimited") };
    data_limit = Math.round(n * GB);
  }

  const reset = get("resetStrategy") || "no_reset";
  if (!(RESET_STRATEGIES as readonly string[]).includes(reset)) return { error: t("流量重置方式不对", "Invalid traffic reset") };

  let expire = 0;
  const addDays = get("addDays").trim();
  if (addDays) {
    const d = Number(addDays);
    if (!Number.isInteger(d) || d <= 0) return { error: t("续期天数要写正整数", "Days to add must be a positive whole number") };
    const base = opts.currentExpire && opts.currentExpire > opts.now ? opts.currentExpire : opts.now;
    expire = base + d * DAY;
  } else if (get("expire").trim()) {
    const at = fromBeijingInput(get("expire").trim());
    if (at === null) return { error: t("到期时间格式不对", "Invalid expiry time") };
    expire = at;
  }

  const status = get("status") || "active";
  if (status !== "active" && status !== "disabled") return { error: t("状态只能是启用或停用", "Status must be enabled or disabled") };

  const note = get("note").trim();
  if (note.length > 500) return { error: t("备注太长了（最多 500 字）", "Note is too long (500 characters max)") };

  return {
    fields: {
      data_limit,
      data_limit_reset_strategy: data_limit ? (reset as UserFields["data_limit_reset_strategy"]) : "no_reset",
      expire,
      note,
      status,
    },
  };
}

// POST /api/user 的请求体：只开 VLESS，inbounds 给空对象，Marzban 会勾上全部 VLESS 入站（和 lib/plans.ts 的 newUserBody 一样）。
// onHoldDays：「首次连上才开始计时」（Marzban 的 on_hold，适合试用），连上后有效这么多天；这时不设到期时间
export function createUserBody(username: string, f: UserFields, onHoldDays?: number | null) {
  const base = { username, proxies: { vless: { flow: "xtls-rprx-vision" } }, inbounds: {}, ...f };
  return onHoldDays ? { ...base, status: "on_hold", expire: 0, on_hold_expire_duration: onHoldDays * DAY } : base;
}

// 新建时「首次连上后有效几天」：空 = 不用这个功能；1–3650 的整数
export function parseOnHoldDays(v: string, lang: Lang = "zh"): { days: number | null } | { error: string } {
  if (!v.trim()) return { days: null };
  const n = Number(v.trim());
  return Number.isInteger(n) && n >= 1 && n <= 3650
    ? { days: n }
    : { error: makeT(lang)("首次连上后有效天数要写 1 到 3650 的整数", "Days after first connection must be a whole number from 1 to 3650") };
}

// 订阅列表每页多少个，最多 200；网址里的 size 不在这几个里就用默认的
export const PAGE_SIZES = [10, 20, 30, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;
export function parsePageSize(v: string): number {
  const n = Number(v);
  return (PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_PAGE_SIZE;
}

// 在线状态，照 Marzban 列表：在线（2 分钟内连过）/ 连过 / 没连过。Marzban 的 online_at 是 UTC 但不带时区
export type OnlineState = "online" | "offline" | "never";
// 英文的「3 days」「1 hour」
const unitEn = (n: number, u: string) => `${n} ${u}${n === 1 ? "" : "s"}`;

export function onlineState(onlineAt: string | null | undefined, nowMs: number, lang: Lang = "zh"): { state: OnlineState; text: string } {
  const en = lang === "en";
  if (!onlineAt) return { state: "never", text: en ? "Never connected" : "没连过" };
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(onlineAt) ? onlineAt : `${onlineAt}Z`);
  if (Number.isNaN(ms)) return { state: "offline", text: "-" };
  const min = Math.floor((nowMs - ms) / 60000);
  if (min < 2) return { state: "online", text: en ? "Online" : "在线" };
  // 最多写两级，比如「1 小时 55 分钟前」「3 天 2 小时前」
  const d = Math.floor(min / (24 * 60));
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const units: [number, string, string][] = d ? [[d, "天", "day"], [h, "小时", "hour"]] : h ? [[h, "小时", "hour"], [m, "分钟", "minute"]] : [[m, "分钟", "minute"]];
  const parts = units.filter(([n], i) => i === 0 || n > 0);
  return {
    state: "offline",
    text: en ? `${parts.map(([n, , u]) => unitEn(n, u)).join(" ")} ago` : `${parts.map(([n, u]) => `${n} ${u}`).join(" ")}前`,
  };
}

export function onlineText(onlineAt: string | null | undefined, nowMs: number, lang: Lang = "zh"): string {
  return onlineState(onlineAt, nowMs, lang).text;
}

// 到期写成「2 个月 26 天后到期」「已过期 3 天」，照 Marzban 列表。按 1 年 365 天、1 个月 30 天算，最多写两级
export function expireRelative(expire: number | null | undefined, nowMs: number, lang: Lang = "zh"): string {
  const en = lang === "en";
  if (!expire) return en ? "Never expires" : "永不到期";
  const sec = Math.abs(expire * 1000 - nowMs) / 1000;
  const days = Math.floor(sec / 86400);
  const units: [number, string, string][] = days
    ? [[Math.floor(days / 365), "年", "year"], [Math.floor((days % 365) / 30), "个月", "month"], [(days % 365) % 30, "天", "day"]]
    : [[Math.floor(sec / 3600), "小时", "hour"], [Math.floor((sec % 3600) / 60), "分钟", "minute"]];
  const first = units.findIndex(([n]) => n > 0);
  const shown = first < 0 ? [] : units.slice(first, first + 2).filter(([n]) => n > 0);
  const text = en
    ? shown.length ? shown.map(([n, , u]) => unitEn(n, u)).join(" ") : "under a minute"
    : shown.length ? shown.map(([n, u]) => `${n} ${u}`).join(" ") : "不到 1 分钟";
  if (expire * 1000 > nowMs) return en ? `Expires in ${text}` : `${text}后到期`;
  return en ? `Expired ${text} ago` : `已过期 ${text}`;
}

// 编辑前后对比，写进操作日志
export function describeChanges(before: Partial<UserFields>, after: UserFields, fmt: (k: keyof UserFields, v: unknown) => string): string {
  const keys = Object.keys(after) as (keyof UserFields)[];
  const changed = keys.filter((k) => (before[k] ?? (k === "expire" || k === "data_limit" ? 0 : "")) !== after[k]);
  return changed.length ? changed.map((k) => `${fmt(k, before[k])} → ${fmt(k, after[k])}`).join("；") : "没改动";
}

// ---- 节点表单 ----
export const NODE_STATUS_LABEL: Record<string, { text: string; badge: string }> = {
  connected: { text: "在线", badge: "badge-success" },
  connecting: { text: "连接中", badge: "badge-warning" },
  error: { text: "出错", badge: "badge-error" },
  disabled: { text: "已停用", badge: "badge-neutral" },
};
const NODE_STATUS_EN: Record<string, string> = { connected: "Online", connecting: "Connecting", error: "Error", disabled: "Disabled" };
export function nodeStatusLabel(status: string, lang: Lang = "zh"): { text: string; badge: string } {
  const s = NODE_STATUS_LABEL[status] ?? { text: status, badge: "badge-neutral" };
  return lang === "en" ? { ...s, text: NODE_STATUS_EN[status] ?? status } : s;
}

// 地址只能是域名或 IP，端口 1–65535，流量倍率 0–10（比如 0.5 表示这个节点的流量只算一半）
export function parseNodeForm(
  get: (key: string) => string,
  lang: Lang = "zh",
): { fields: { name: string; address: string; port: number; api_port: number; usage_coefficient: number } } | { error: string } {
  const t = makeT(lang);
  const name = get("name").trim();
  if (!name || name.length > 64) return { error: t("节点名必填，最多 64 个字", "Node name is required, 64 characters max") };
  const address = get("address").trim();
  if (!/^[a-zA-Z0-9.-]+$/.test(address) && !/^[0-9a-fA-F:]+$/.test(address)) return { error: t("地址要写域名或 IP，不带 http://", "Address must be a domain or IP, without http://") };
  const port = Number(get("port") || 62050);
  const api_port = Number(get("apiPort") || 62051);
  for (const p of [port, api_port]) if (!Number.isInteger(p) || p < 1 || p > 65535) return { error: t("端口要是 1 到 65535 的整数", "Ports must be whole numbers from 1 to 65535") };
  if (port === api_port) return { error: t("服务端口和 API 端口不能一样", "Service port and API port must differ") };
  const usage_coefficient = Number(get("coefficient") || 1);
  if (!Number.isFinite(usage_coefficient) || usage_coefficient <= 0 || usage_coefficient > 10) return { error: t("流量倍率要大于 0、不超过 10", "Traffic multiplier must be above 0 and at most 10") };
  return { fields: { name, address, port, api_port, usage_coefficient } };
}

// 本月 1 号 0 点（北京时间）
export function monthStartBeijing(nowMs: number): Date {
  const bj = new Date(nowMs + 8 * 3600_000);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), 1) - 8 * 3600_000);
}

// ---- Host 校验 ----
export const HOST_SECURITY = ["inbound_default", "none", "tls"] as const;

// 后台提交上来的一个入站的 Host 列表：备注、地址必填；端口空着就用入站的端口；
// 其他字段（mux、fragment 等后台不改的）原样保留
export function validateHosts(input: unknown, lang: Lang = "zh"): { hosts: Record<string, unknown>[] } | { error: string } {
  const en = lang === "en";
  if (!Array.isArray(input)) return { error: en ? "Invalid Host data" : "Host 数据不对" };
  const out: Record<string, unknown>[] = [];
  for (const [i, raw] of input.entries()) {
    if (!raw || typeof raw !== "object") return { error: en ? `Host ${i + 1}: invalid data` : `第 ${i + 1} 个 Host 数据不对` };
    const h = raw as Record<string, unknown>;
    const n = en ? `Host ${i + 1}` : `第 ${i + 1} 个 Host`;
    const remark = String(h.remark ?? "").trim();
    const address = String(h.address ?? "").trim();
    if (!remark) return { error: en ? `${n}: remark (the node name customers see) is required` : `${n}的备注（客人看到的节点名）不能空` };
    if (!address) return { error: en ? `${n}: address is required` : `${n}的地址不能空` };
    if (/^https?:\/\//i.test(address)) return { error: en ? `${n}: address must not include http://` : `${n}的地址不要带 http://` };
    let port: number | null = null;
    if (h.port !== null && h.port !== undefined && String(h.port).trim() !== "") {
      port = Number(h.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) return { error: en ? `${n}: port must be 1 to 65535, or empty to use the inbound's` : `${n}的端口要是 1 到 65535，或者留空用入站的端口` };
    }
    const security = String(h.security ?? "inbound_default");
    if (!(HOST_SECURITY as readonly string[]).includes(security)) return { error: en ? `${n}: invalid security setting` : `${n}的安全设置不对` };
    const opt = (v: unknown) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim());
    out.push({ ...h, remark, address, port, sni: opt(h.sni), host: opt(h.host), path: opt(h.path), security, is_disabled: !!h.is_disabled });
  }
  return { hosts: out };
}

// 「到期超过 N 天」的 N：1–3650 的整数
export function parseExpiredDays(v: string): number | null {
  const n = Number(v.trim());
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : null;
}
