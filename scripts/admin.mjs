// 管理员命令行脚本共用的东西：读写 D1、连 Marzban、确认提示。
// record-payment.mjs 和 orders.mjs 都用这一份，免得两边各写一遍连线上的逻辑。
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { formatBytes, formatExpire } from "../lib/format.ts";
import { site } from "../site.config.ts";

export function fail(msg) {
  console.error(msg);
  process.exit(1);
}

// SQL 字符串字面量
export const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

// 跑一条 SQL，返回结果行。remote 为 true 写线上库，否则写本地开发库
export function d1(remote, sql) {
  const out = wrangler(["d1", "execute", "DB", remote ? "--remote" : "--local", "--json", "--command", sql]);
  return JSON.parse(out)[0].results;
}

// 直接用 node 跑 wrangler，不经过 npx：Windows 上 npx 是 npx.cmd，不开 shell 起不来，
// 开 shell 又会把 SQL 里的引号和换行搞乱
const wranglerBin = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
export function wrangler(args) {
  return execFileSync(process.execPath, [wranglerBin, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

export async function confirmYes(prompt) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const yes = (await rl.question(`${prompt}输入 yes 继续：`)).trim() === "yes";
  rl.close();
  return yes;
}

// ---- Marzban ----
// 本地：环境变量，没有就用假 Marzban（npm run mock）的默认值。
// 线上：环境变量，或者 portal/.remote.vars（不进 git，格式同 .dev.vars）。
// 不读 .dev.vars，免得本地库的单开到线上 Marzban 上
function marzbanConfig(remote) {
  const file = remote && existsSync(".remote.vars") ? readFileSync(".remote.vars", "utf8") : "";
  const fromFile = Object.fromEntries(
    file
      .split("\n")
      .map((l) => /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(l))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^(["'])(.*)\1$/, "$2")]),
  );
  const get = (k, dev) => process.env[k] ?? fromFile[k] ?? (remote ? undefined : dev);
  const cfg = {
    url: get("MARZBAN_URL", "http://localhost:8010")?.replace(/\/+$/, ""),
    username: get("MARZBAN_USERNAME", "admin"),
    password: get("MARZBAN_PASSWORD", "admin"),
  };
  if (!cfg.url || !cfg.username || !cfg.password) {
    fail("线上 Marzban 的地址和管理员账号没配：复制 .remote.vars.example 成 .remote.vars 填好，或者设环境变量");
  }
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(cfg.url);
  if (remote && local) fail(`线上库不能配本地的 Marzban（${cfg.url}）`);
  if (!remote && !local) fail(`本地库只能连本地的假 Marzban，现在是 ${cfg.url}。要写线上请加 --remote`);
  return cfg;
}

// 返回 Marzban 客户端。ops 的格式和 lib/provision.ts 要的一样
export function marzban(remote) {
  const mz = marzbanConfig(remote);
  let token = null;

  async function api(method, path, body) {
    if (!token) {
      const res = await fetch(`${mz.url}/api/admin/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username: mz.username, password: mz.password }),
      });
      if (!res.ok) fail(`Marzban 管理员登录失败（${res.status}）`);
      token = (await res.json()).access_token;
    }
    const res = await fetch(`${mz.url}/api${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404 && method === "GET") return null;
    if (!res.ok) throw new Error(`Marzban ${method} ${path} 返回 ${res.status}：${await res.text()}`);
    return res.json();
  }

  const getUser = (username) => api("GET", `/user/${encodeURIComponent(username)}`);
  return {
    url: mz.url,
    getUser,
    ops: {
      findUser: getUser,
      createUser: (body) => api("POST", "/user", body),
      modifyUser: (username, body) => api("PUT", `/user/${encodeURIComponent(username)}`, body),
      resetUsage: (username) => api("POST", `/user/${encodeURIComponent(username)}/reset`),
      vlessInbounds: async () => ((await api("GET", "/inbounds")).vless ?? []).map((i) => i.tag),
      proOnly: site.proOnlyInbounds,
    },
  };
}

// 确认前显示的档位（分档时才显示）
export const tierText = (plan) =>
  site.proOnlyInbounds?.length ? `，${plan.pro ? "Pro 档（全部节点）" : `Basic 档（不含 ${site.proOnlyInbounds.join("、")}）`}` : "";

export const describeUser = (u) =>
  `到期 ${formatExpire(u.expire || null)}，流量 ${formatBytes(u.used_traffic)} / ${u.data_limit ? formatBytes(u.data_limit) : "不限"}，备注 ${u.note || "（空）"}`;
