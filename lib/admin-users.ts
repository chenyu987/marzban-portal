// 后台「用户」页的表单解析和显示用的小函数。只放纯函数，方便单测
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
): { fields: UserFields } | { error: string } {
  const gb = get("dataGB").trim();
  let data_limit = 0;
  if (gb) {
    const n = Number(gb);
    if (!Number.isFinite(n) || n <= 0) return { error: "流量要写大于 0 的数（单位 GB），不限流量就留空" };
    data_limit = Math.round(n * GB);
  }

  const reset = get("resetStrategy") || "no_reset";
  if (!(RESET_STRATEGIES as readonly string[]).includes(reset)) return { error: "流量重置方式不对" };

  let expire = 0;
  const addDays = get("addDays").trim();
  if (addDays) {
    const d = Number(addDays);
    if (!Number.isInteger(d) || d <= 0) return { error: "续期天数要写正整数" };
    const base = opts.currentExpire && opts.currentExpire > opts.now ? opts.currentExpire : opts.now;
    expire = base + d * DAY;
  } else if (get("expire").trim()) {
    const t = fromBeijingInput(get("expire").trim());
    if (t === null) return { error: "到期时间格式不对" };
    expire = t;
  }

  const status = get("status") || "active";
  if (status !== "active" && status !== "disabled") return { error: "状态只能是启用或停用" };

  const note = get("note").trim();
  if (note.length > 500) return { error: "备注太长了（最多 500 字）" };

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

// POST /api/user 的请求体：只开 VLESS，inbounds 给空对象，Marzban 会勾上全部 VLESS 入站（和 lib/plans.ts 的 newUserBody 一样）
export function createUserBody(username: string, f: UserFields) {
  return { username, proxies: { vless: { flow: "xtls-rprx-vision" } }, inbounds: {}, ...f };
}

// 「3 分钟前」这种。Marzban 的 online_at 是 UTC 但不带时区
export function onlineText(onlineAt: string | null | undefined, nowMs: number): string {
  if (!onlineAt) return "没连过";
  const ms = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(onlineAt) ? onlineAt : `${onlineAt}Z`);
  if (Number.isNaN(ms)) return "-";
  const min = Math.floor((nowMs - ms) / 60000);
  if (min < 2) return "在线";
  if (min < 60) return `${min} 分钟前`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} 小时前`;
  return `${Math.floor(min / (24 * 60))} 天前`;
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

// 地址只能是域名或 IP，端口 1–65535，流量倍率 0–10（比如 0.5 表示这个节点的流量只算一半）
export function parseNodeForm(get: (key: string) => string):
  | { fields: { name: string; address: string; port: number; api_port: number; usage_coefficient: number } }
  | { error: string } {
  const name = get("name").trim();
  if (!name || name.length > 64) return { error: "节点名必填，最多 64 个字" };
  const address = get("address").trim();
  if (!/^[a-zA-Z0-9.-]+$/.test(address) && !/^[0-9a-fA-F:]+$/.test(address)) return { error: "地址要写域名或 IP，不带 http://" };
  const port = Number(get("port") || 62050);
  const api_port = Number(get("apiPort") || 62051);
  for (const p of [port, api_port]) if (!Number.isInteger(p) || p < 1 || p > 65535) return { error: "端口要是 1 到 65535 的整数" };
  if (port === api_port) return { error: "服务端口和 API 端口不能一样" };
  const usage_coefficient = Number(get("coefficient") || 1);
  if (!Number.isFinite(usage_coefficient) || usage_coefficient <= 0 || usage_coefficient > 10) return { error: "流量倍率要大于 0、不超过 10" };
  return { fields: { name, address, port, api_port, usage_coefficient } };
}

// 本月 1 号 0 点（北京时间）
export function monthStartBeijing(nowMs: number): Date {
  const bj = new Date(nowMs + 8 * 3600_000);
  return new Date(Date.UTC(bj.getUTCFullYear(), bj.getUTCMonth(), 1) - 8 * 3600_000);
}
