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
  online_at?: string | null; // 最后一次连上的时间，UTC，不带时区；没连过是 null
  created_at?: string;
  lifetime_used_traffic?: number;
  links?: string[]; // 每个节点一条连接链接（vless://…），客户端不支持订阅时手动导入用
  on_hold_expire_duration?: number | null; // on_hold 时：首次连上后有效多少秒
};

export type UserStatus = MarzbanUser["status"];

// GET /api/system：面板首页那几个数
export type SystemStats = {
  version: string;
  mem_total: number;
  mem_used: number;
  cpu_cores: number;
  cpu_usage: number;
  total_user: number;
  users_active: number;
  incoming_bandwidth: number;
  outgoing_bandwidth: number;
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

async function api<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
  const token = cachedToken ?? (await login());
  const res = await fetch(`${env().MARZBAN_URL}/api${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !retried) {
    cachedToken = null;
    return api(method, path, body, true);
  }
  if (!res.ok) throw new MarzbanError(res.status, `Marzban ${method} ${path} 返回 ${res.status}`);
  return normalize((await res.json()) as T);
}

// 没设 XRAY_SUBSCRIPTION_URL_PREFIX 时 Marzban 返回的是相对路径 /sub/...；用户列表里的每个也一样处理
function normalize<T>(data: T): T {
  const fix = (u: Partial<MarzbanUser>) => {
    if (typeof u?.subscription_url === "string" && u.subscription_url.startsWith("/")) {
      u.subscription_url = env().MARZBAN_URL + u.subscription_url;
    }
  };
  const list = (data as { users?: Partial<MarzbanUser>[] })?.users;
  if (Array.isArray(list)) list.forEach(fix);
  else fix(data as Partial<MarzbanUser>);
  return data;
}

export const getUser = (username: string) => api<MarzbanUser>("GET", `/user/${encodeURIComponent(username)}`);

// 查不到返回 null，用来挑一个没被占用的用户名
export async function findUser(username: string): Promise<MarzbanUser | null> {
  try {
    return await getUser(username);
  } catch (e) {
    if (e instanceof MarzbanError && e.status === 404) return null;
    throw e;
  }
}

// 请求体由 lib/plans.ts 的 newUserBody、renewUserBody 生成
export const createUser = (body: { username: string }) => api<MarzbanUser>("POST", "/user", body);

export const modifyUser = (username: string, body: object) =>
  api<MarzbanUser>("PUT", `/user/${encodeURIComponent(username)}`, body);

// 已用流量清零
export const resetUsage = (username: string) =>
  api<MarzbanUser>("POST", `/user/${encodeURIComponent(username)}/reset`);

export const revokeSubscription = (username: string) =>
  api<MarzbanUser>("POST", `/user/${encodeURIComponent(username)}/revoke_sub`);

export const deleteUser = (username: string) => api<unknown>("DELETE", `/user/${encodeURIComponent(username)}`);

// 用户列表（后台「用户」页）。search 按用户名和备注模糊搜；sort 是 Marzban 的写法，前面加 - 表示倒序
export function listUsers(p: { offset: number; limit: number; search?: string; status?: UserStatus; sort?: string }) {
  const qs = new URLSearchParams({ offset: String(p.offset), limit: String(p.limit) });
  if (p.search) qs.set("search", p.search);
  if (p.status) qs.set("status", p.status);
  if (p.sort) qs.set("sort", p.sort);
  return api<{ users: MarzbanUser[]; total: number }>("GET", `/users?${qs}`);
}

export const getSystem = () => api<SystemStats>("GET", "/system");

// 用订阅 token 查是谁的订阅（公开接口，不用管理员 token）。查不到返回 null
export async function lookupSubscription(subToken: string): Promise<{ username: string } | null> {
  const res = await fetch(`${env().MARZBAN_URL}/sub/${encodeURIComponent(subToken)}/info`);
  if (res.status === 404) return null;
  if (!res.ok) throw new MarzbanError(res.status, `Marzban 订阅查询返回 ${res.status}`);
  return (await res.json()) as { username: string };
}

// ---- 节点和核心（后台「节点」页）----

export type NodeStatus = "connected" | "connecting" | "error" | "disabled";
export type MarzbanNode = {
  id: number;
  name: string;
  address: string;
  port: number;
  api_port: number;
  usage_coefficient: number;
  xray_version: string | null;
  status: NodeStatus;
  message: string | null;
};
export type NodeFields = { name: string; address: string; port: number; api_port: number; usage_coefficient: number };

export const listNodes = () => api<MarzbanNode[]>("GET", "/nodes");
// add_as_new_host：Marzban 会照主节点的 Host 给新节点各加一份，客人订阅里马上多出这个节点
export const addNode = (f: NodeFields) => api<MarzbanNode>("POST", "/node", { ...f, add_as_new_host: true });
export const modifyNode = (id: number, body: Partial<NodeFields> & { status?: "disabled" | "connecting" }) => api<MarzbanNode>("PUT", `/node/${id}`, body);
export const reconnectNode = (id: number) => api<unknown>("POST", `/node/${id}/reconnect`);
export const deleteNode = (id: number) => api<unknown>("DELETE", `/node/${id}`);
// 节点装 Marzban Node 时要用的证书
export const nodeSettings = () => api<{ min_node_version: string; certificate: string }>("GET", "/node/settings");

// 各节点在一段时间里的流量。node_id 是 null 的是面板本机（主节点）。时间是 UTC、不带时区
export async function nodesUsage(start: Date, end: Date) {
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const qs = new URLSearchParams({ start: iso(start), end: iso(end) });
  return api<{ usages: { node_id: number | null; node_name: string; uplink: number; downlink: number }[] }>("GET", `/nodes/usage?${qs}`);
}

export const coreStats = () => api<{ version: string; started: boolean; logs_websocket: string }>("GET", "/core");
// 重启主节点的 Xray（会顺带把所有节点也重启一遍），所有人断开几秒
export const restartCore = () => api<unknown>("POST", "/core/restart");

// ---- 入站和 Host（后台「Host」页）----

export type Inbound = { tag: string; protocol: string; network: string; tls: string; port: number | string };
// Host 有很多字段（mux、fragment……），后台只改常用的几个，其他原样带回去
export type ProxyHost = {
  remark: string;
  address: string;
  port: number | null;
  sni: string | null;
  host: string | null;
  path: string | null;
  security: "inbound_default" | "none" | "tls";
  is_disabled?: boolean;
  [k: string]: unknown;
};

export const listInbounds = () => api<Record<string, Inbound[]>>("GET", "/inbounds");
export const getHosts = () => api<Record<string, ProxyHost[]>>("GET", "/hosts");
// 整份替换：传进去的是全部入站的 Host
export const putHosts = (hosts: Record<string, ProxyHost[]>) => api<Record<string, ProxyHost[]>>("PUT", "/hosts", hosts);

// ---- 批量操作和单个用户的流量明细 ----
const isoUtc = (d: Date) => d.toISOString().slice(0, 19);

// 到期时间在 before 之前的用户名（已经过期了的）
export const expiredUsers = (before: Date) => api<string[]>("GET", `/users/expired?${new URLSearchParams({ expired_before: isoUtc(before) })}`);
export const deleteExpiredUsers = (before: Date) =>
  api<string[]>("DELETE", `/users/expired?${new URLSearchParams({ expired_before: isoUtc(before) })}`);
// 所有用户的已用流量清零
export const resetAllUsage = () => api<unknown>("POST", "/users/reset");
// 一个用户在一段时间里在各节点用的流量
export const userUsage = (username: string, start: Date, end: Date) =>
  api<{ usages: { node_id: number | null; node_name: string; used_traffic: number }[] }>(
    "GET",
    `/user/${encodeURIComponent(username)}/usage?${new URLSearchParams({ start: isoUtc(start), end: isoUtc(end) })}`,
  );
