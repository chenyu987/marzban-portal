// 本地开发用的假 Marzban，只实现 portal 用到的接口，返回格式照 Marzban v0.8.4 源码
// （app/routers/user.py、subscription.py、admin.py、app/models/user.py）。
// 数据只在内存里，重启就恢复成下面的种子数据。
//
// 用法：node dev/mock-marzban.mjs   （默认端口 8010）
// 管理员：admin / admin
// 种子用户的订阅链接启动时打印在终端里，拿来测试「绑定已有订阅」。

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_MARZBAN_PORT ?? 8010);
const BASE = `http://localhost:${PORT}`;
const ADMIN = { username: "admin", password: "admin" };
const GB = 1024 ** 3;
const now = () => Math.floor(Date.now() / 1000);

// 几个节点各一个 VLESS 入站，另外有一个不给客人用的 Shadowsocks 入站
const INBOUNDS = { vless: ["VLESS TCP REALITY", "VLESS NODE2", "VLESS NODE3"], shadowsocks: ["Shadowsocks TCP"] };

// 照 Marzban 0.8.4 新建用户时的入站：请求里没有 inbounds 字段时校验不运行，一个入站都不勾；
// 有这个字段时，没点名入站的协议勾上该协议的全部入站
function createInbounds(body) {
  const out = {};
  for (const p of Object.keys(body.proxies ?? {})) {
    if (!("inbounds" in body)) out[p] = [];
    else out[p] = body.inbounds?.[p]?.length ? body.inbounds[p] : (INBOUNDS[p] ?? []);
  }
  return out;
}

// 节点：种子一个在线、一个出错的
const nodes = new Map();
let nextNodeId = 1;
const pickNode = ({ name, address, port = 62050, api_port = 62051, usage_coefficient = 1 }) => ({ name, address, port, api_port, usage_coefficient });
for (const n of [
  { name: "东京", address: "tokyo.example.test", status: "connected", xray_version: "26.6.27", message: null },
  { name: "大阪", address: "osaka.example.test", status: "error", xray_version: null, message: "connection refused" },
]) {
  nodes.set(nextNodeId, { id: nextNodeId, ...pickNode(n), ...n });
  nextNodeId++;
}

// Host：每个入站一个，带一个后台不改的字段（mux_enable），检查保存时会不会被弄丢
const hosts = Object.fromEntries(
  Object.values(INBOUNDS)
    .flat()
    .map((tag) => [tag, [{ remark: `${tag} {USERNAME}`, address: "{SERVER_IP}", port: null, sni: null, host: null, path: null, security: "inbound_default", is_disabled: false, mux_enable: true }]]),
);

const adminTokens = new Set();
const users = new Map(); // username -> user
const subTokens = new Map(); // sub token -> username

function newSubToken(username) {
  for (const [t, u] of subTokens) if (u === username) subTokens.delete(t);
  const token = crypto.randomBytes(24).toString("base64url");
  subTokens.set(token, username);
  return token;
}

function addUser({
  username,
  expire = null,
  data_limit = null,
  data_limit_reset_strategy = "no_reset",
  used_traffic = 0,
  status = "active",
  note = "",
  inbounds = { vless: INBOUNDS.vless },
}) {
  const token = newSubToken(username);
  users.set(username, {
    username,
    status,
    expire,
    data_limit,
    data_limit_reset_strategy,
    used_traffic,
    lifetime_used_traffic: used_traffic,
    note,
    proxies: { vless: { id: crypto.randomUUID(), flow: "xtls-rprx-vision" } },
    inbounds,
    created_at: new Date().toISOString(),
    online_at: null,
    sub_updated_at: null,
    on_hold_expire_duration: null,
    on_hold_timeout: null,
    next_plan: null,
    _token: token,
  });
}

addUser({ username: "alice", expire: now() + 20 * 86400, data_limit: 100 * GB, used_traffic: Math.round(37.4 * GB), note: "ip=3" });
addUser({ username: "bob", expire: now() - 3 * 86400, data_limit: 50 * GB, used_traffic: 12 * GB, status: "expired" });
addUser({ username: "carol", expire: null, data_limit: null, used_traffic: 210 * GB, note: "ip=不限" });

function toResponse(u) {
  const { _token, ...rest } = u;
  const subscription_url = `${BASE}/sub/${_token}`;
  return {
    ...rest,
    subscription_url,
    links: [`vless://${u.proxies.vless.id}@127.0.0.1:443?security=reality&type=tcp&flow=xtls-rprx-vision#${u.username}`],
    excluded_inbounds: { vless: [] },
    admin: { username: ADMIN.username, is_sudo: true },
  };
}

// /sub/{token}/info 用的是 SubscriptionUserResponse，去掉了 admin、note、inbounds 等字段
function toSubInfo(u) {
  const { admin, note, inbounds, excluded_inbounds, auto_delete_in_days, ...rest } = toResponse(u);
  return rest;
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
  });
}

function isAdmin(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? "");
  return m && adminTokens.has(m[1]);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  const log = (status) => console.log(`${req.method} ${path} -> ${status}`);

  if (req.method === "POST" && path === "/api/admin/token") {
    const form = new URLSearchParams(await readBody(req));
    if (form.get("username") !== ADMIN.username || form.get("password") !== ADMIN.password) {
      log(401);
      return send(res, 401, { detail: "Incorrect username or password" });
    }
    const token = crypto.randomBytes(32).toString("hex");
    adminTokens.add(token);
    log(200);
    return send(res, 200, { access_token: token, token_type: "bearer" });
  }

  let m;
  if ((m = /^\/sub\/([^/]+)\/info$/.exec(path)) && req.method === "GET") {
    const username = subTokens.get(m[1]);
    if (!username) return log(404), send(res, 404, { detail: "Not Found" });
    log(200);
    return send(res, 200, toSubInfo(users.get(username)));
  }

  if (path.startsWith("/api/")) {
    if (!isAdmin(req)) return log(401), send(res, 401, { detail: "Not authenticated" });

    if ((m = /^\/api\/user\/([^/]+)$/.exec(path)) && req.method === "GET") {
      const u = users.get(decodeURIComponent(m[1]));
      if (!u) return log(404), send(res, 404, { detail: "User not found" });
      log(200);
      return send(res, 200, toResponse(u));
    }

    // 新建用户（记账脚本 --plan 用）。没给 inbounds 时 Marzban 会把该协议的入站全加上
    if (path === "/api/user" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!/^[a-z0-9_]{3,32}$/.test(body.username ?? "")) return log(422), send(res, 422, { detail: "Invalid username" });
      if (users.has(body.username)) return log(409), send(res, 409, { detail: "User already exists" });
      addUser({
        username: body.username,
        expire: body.expire || null,
        data_limit: body.data_limit || null,
        data_limit_reset_strategy: body.data_limit_reset_strategy ?? "no_reset",
        status: body.status ?? "active",
        note: body.note ?? "",
        inbounds: createInbounds(body),
      });
      log(200);
      return send(res, 200, toResponse(users.get(body.username)));
    }

    if ((m = /^\/api\/user\/([^/]+)$/.exec(path)) && req.method === "PUT") {
      const u = users.get(decodeURIComponent(m[1]));
      if (!u) return log(404), send(res, 404, { detail: "User not found" });
      const body = JSON.parse((await readBody(req)) || "{}");
      for (const k of ["expire", "data_limit", "note", "status", "data_limit_reset_strategy"]) {
        if (k in body) u[k] = (k === "expire" || k === "data_limit") && body[k] === 0 ? null : body[k];
      }
      log(200);
      return send(res, 200, toResponse(u));
    }

    if ((m = /^\/api\/user\/([^/]+)$/.exec(path)) && req.method === "DELETE") {
      const name = decodeURIComponent(m[1]);
      if (!users.has(name)) return log(404), send(res, 404, { detail: "User not found" });
      users.delete(name);
      for (const [t, u] of subTokens) if (u === name) subTokens.delete(t);
      log(200);
      return send(res, 200, {});
    }

    // 用户列表：search 按用户名和备注模糊搜，status 筛状态，sort 前面加 - 是倒序，offset/limit 翻页
    if (path === "/api/users" && req.method === "GET") {
      const q = url.searchParams;
      const search = (q.get("search") ?? "").toLowerCase();
      const status = q.get("status");
      const sort = q.get("sort") ?? "";
      let list = [...users.values()].filter(
        (u) => (!search || u.username.toLowerCase().includes(search) || (u.note ?? "").toLowerCase().includes(search)) && (!status || u.status === status),
      );
      if (sort) {
        const key = sort.replace(/^-/, "");
        const dir = sort.startsWith("-") ? -1 : 1;
        list.sort((a, b) => ((a[key] ?? 0) > (b[key] ?? 0) ? dir : (a[key] ?? 0) < (b[key] ?? 0) ? -dir : 0));
      }
      const offset = Number(q.get("offset") ?? 0);
      const limit = Number(q.get("limit") ?? list.length);
      log(200);
      return send(res, 200, { users: list.slice(offset, offset + limit).map(toResponse), total: list.length });
    }

    // ---- 批量操作和流量明细 ----
    if (path === "/api/users/expired" && (req.method === "GET" || req.method === "DELETE")) {
      const before = Date.parse(`${url.searchParams.get("expired_before")}Z`) / 1000;
      const names = [...users.values()].filter((u) => u.expire && u.expire < before).map((u) => u.username);
      if (req.method === "DELETE") for (const n of names) users.delete(n);
      log(200);
      return send(res, 200, names);
    }
    if (path === "/api/users/reset" && req.method === "POST") {
      for (const u of users.values()) {
        u.used_traffic = 0;
        if (u.status === "limited") u.status = "active";
      }
      return log(200), send(res, 200, {});
    }
    if ((m = /^\/api\/user\/([^/]+)\/usage$/.exec(path)) && req.method === "GET") {
      const u = users.get(decodeURIComponent(m[1]));
      if (!u) return log(404), send(res, 404, { detail: "User not found" });
      log(200);
      return send(res, 200, { username: u.username, usages: [{ node_id: null, node_name: "Master", used_traffic: u.used_traffic }, { node_id: 1, node_name: "东京", used_traffic: 0 }] });
    }

    // ---- 入站和 Host ----
    if (path === "/api/inbounds" && req.method === "GET") {
      const out = {};
      for (const [proto, tags] of Object.entries(INBOUNDS)) out[proto] = tags.map((tag, i) => ({ tag, protocol: proto, network: "tcp", tls: proto === "vless" ? "reality" : "none", port: 443 + i }));
      log(200);
      return send(res, 200, out);
    }
    if (path === "/api/hosts" && req.method === "GET") return log(200), send(res, 200, hosts);
    if (path === "/api/hosts" && req.method === "PUT") {
      const body = JSON.parse((await readBody(req)) || "{}");
      for (const tag of Object.keys(body)) if (!Object.values(INBOUNDS).flat().includes(tag)) return log(400), send(res, 400, { detail: `Inbound ${tag} doesn't exist` });
      Object.assign(hosts, body);
      log(200);
      return send(res, 200, hosts);
    }

    // ---- 节点和核心 ----
    if (path === "/api/nodes" && req.method === "GET") return log(200), send(res, 200, [...nodes.values()]);
    if (path === "/api/node/settings" && req.method === "GET") {
      log(200);
      return send(res, 200, { min_node_version: "v0.2.0", certificate: "-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----" });
    }
    if (path === "/api/node" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      if ([...nodes.values()].some((n) => n.name === body.name)) return log(409), send(res, 409, { detail: `Node "${body.name}" already exists` });
      const node = { id: nextNodeId++, ...pickNode(body), xray_version: null, status: "connecting", message: null };
      nodes.set(node.id, node);
      log(200);
      return send(res, 200, node);
    }
    if ((m = /^\/api\/node\/(\d+)$/.exec(path))) {
      const node = nodes.get(Number(m[1]));
      if (!node) return log(404), send(res, 404, { detail: "Node not found" });
      if (req.method === "PUT") {
        const body = JSON.parse((await readBody(req)) || "{}");
        Object.assign(node, pickNode({ ...node, ...body }));
        if (body.status === "disabled") Object.assign(node, { status: "disabled", xray_version: null });
        if (body.status === "connecting") Object.assign(node, { status: "connected", xray_version: "26.6.27" });
        log(200);
        return send(res, 200, node);
      }
      if (req.method === "DELETE") return nodes.delete(node.id), log(200), send(res, 200, {});
    }
    if ((m = /^\/api\/node\/(\d+)\/reconnect$/.exec(path)) && req.method === "POST") {
      const node = nodes.get(Number(m[1]));
      if (!node) return log(404), send(res, 404, { detail: "Node not found" });
      Object.assign(node, { status: "connected", message: null, xray_version: "26.6.27" });
      log(200);
      return send(res, 200, {});
    }
    if (path === "/api/nodes/usage" && req.method === "GET") {
      log(200);
      return send(res, 200, {
        usages: [{ node_id: null, node_name: "Master", uplink: 5 * GB, downlink: 45 * GB }, ...[...nodes.values()].map((n) => ({ node_id: n.id, node_name: n.name, uplink: GB, downlink: 9 * GB }))],
      });
    }
    if (path === "/api/core" && req.method === "GET") return log(200), send(res, 200, { version: "26.6.27", started: true, logs_websocket: "/api/core/logs" });
    if (path === "/api/core/restart" && req.method === "POST") return log(200), send(res, 200, {});

    if (path === "/api/system" && req.method === "GET") {
      const all = [...users.values()];
      log(200);
      return send(res, 200, {
        version: "0.8.4",
        mem_total: 1024 ** 3,
        mem_used: 400 * 1024 ** 2,
        cpu_cores: 1,
        cpu_usage: 12.5,
        total_user: all.length,
        users_active: all.filter((u) => u.status === "active").length,
        incoming_bandwidth: 10 * GB,
        outgoing_bandwidth: 90 * GB,
        incoming_bandwidth_speed: 0,
        outgoing_bandwidth_speed: 0,
      });
    }

    if ((m = /^\/api\/user\/([^/]+)\/reset$/.exec(path)) && req.method === "POST") {
      const u = users.get(decodeURIComponent(m[1]));
      if (!u) return log(404), send(res, 404, { detail: "User not found" });
      u.used_traffic = 0;
      if (u.status === "limited") u.status = "active";
      log(200);
      return send(res, 200, toResponse(u));
    }

    if ((m = /^\/api\/user\/([^/]+)\/revoke_sub$/.exec(path)) && req.method === "POST") {
      const u = users.get(decodeURIComponent(m[1]));
      if (!u) return log(404), send(res, 404, { detail: "User not found" });
      u._token = newSubToken(u.username);
      log(200);
      return send(res, 200, toResponse(u));
    }
  }

  log(404);
  send(res, 404, { detail: "Not Found" });
});

server.listen(PORT, () => {
  console.log(`mock Marzban on ${BASE}  (admin / admin)`);
  for (const u of users.values()) console.log(`  ${u.username.padEnd(6)} ${BASE}/sub/${u._token}`);
});
