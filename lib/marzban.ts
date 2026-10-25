// Marzban v0.8.4 API 客户端。只在服务端用：管理员账号密码绝不能进浏览器。
import { env } from "./env";

export type MarzbanUser = {
  username: string;
  status: "active" | "disabled" | "limited" | "expired" | "on_hold";
  expire: number | null; // unix 秒；null 表示永不到期
  data_limit: number | null; // 字节；null 表示不限
  data_limit_reset_strategy?: "no_reset" | "day" | "week" | "month" | "year";
  used_traffic: number;
  subscription_url: string;
  note?: string | null;
};

export class MarzbanError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// 管理员 token 默认 24 小时有效。缓存在 isolate 内存里，收到 401 就重新登录一次
let cachedToken: string | null = null;

async function login(): Promise<string> {
  const { MARZBAN_URL, MARZBAN_USERNAME, MARZBAN_PASSWORD } = env();
  const res = await fetch(`${MARZBAN_URL}/api/admin/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: MARZBAN_USERNAME, password: MARZBAN_PASSWORD }),
  });
  if (!res.ok) throw new MarzbanError(res.status, "Marzban 管理员登录失败");
  cachedToken = ((await res.json()) as { access_token: string }).access_token;
  return cachedToken;
}

async function api<T>(method: string, path: string, retried = false): Promise<T> {
  const token = cachedToken ?? (await login());
  const res = await fetch(`${env().MARZBAN_URL}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return api(method, path, true);
  }
  if (!res.ok) throw new MarzbanError(res.status, `Marzban ${method} ${path} 返回 ${res.status}`);
  return normalize((await res.json()) as T);
}

// 没设 XRAY_SUBSCRIPTION_URL_PREFIX 时 Marzban 返回的是相对路径 /sub/...
function normalize<T>(data: T): T {
  const u = data as Partial<MarzbanUser>;
  if (typeof u?.subscription_url === "string" && u.subscription_url.startsWith("/")) {
    u.subscription_url = env().MARZBAN_URL + u.subscription_url;
  }
  return data;
}

export const getUser = (username: string) => api<MarzbanUser>("GET", `/user/${encodeURIComponent(username)}`);

export const revokeSubscription = (username: string) =>
  api<MarzbanUser>("POST", `/user/${encodeURIComponent(username)}/revoke_sub`);

// 用订阅 token 查是谁的订阅（公开接口，不用管理员 token）。查不到返回 null
export async function lookupSubscription(subToken: string): Promise<{ username: string } | null> {
  const res = await fetch(`${env().MARZBAN_URL}/sub/${encodeURIComponent(subToken)}/info`);
  if (res.status === 404) return null;
  if (!res.ok) throw new MarzbanError(res.status, `Marzban 订阅查询返回 ${res.status}`);
  return (await res.json()) as { username: string };
}
