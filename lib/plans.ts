// 套餐怎么落到 Marzban 用户上：新开时的请求体、续期后的到期时间、备注里的 ip=N。
// 只放纯函数，网页和命令行脚本共用（脚本用 node 直接跑，这里不要引入运行时依赖）
import type { Plan } from "../site.config.example";

const DAY = 86400;
const GB = 1024 ** 3;

export function findPlan(plans: Plan[], id: string): Plan | undefined {
  return plans.find((p) => p.id === id);
}

// 续期从原到期时间往后加；已经过期的从现在算，免得客人白白损失过期那几天之后的时间
export function renewedExpire(current: number | null, days: number, now: number): number {
  const base = current && current > now ? current : now;
  return base + days * DAY;
}

// 备注里可能还有别的内容，只改 ip= 这一项，没有就加在最后
export function setIpNote(note: string | null | undefined, ip: number): string {
  const tag = `ip=${ip}`;
  const old = note ?? "";
  if (/(^|\s)ip=\S*/.test(old)) return old.replace(/(^|\s)ip=\S*/, `$1${tag}`);
  return old.trim() ? `${old.trimEnd()} ${tag}` : tag;
}

// Marzban 用户名：c<客人id>_<序号>，序号接着这个客人已有的往下排。不带邮箱，因为用户名会显示在客户端里
export function nextUsername(customerId: number, existing: string[]): string {
  const prefix = `c${customerId}_`;
  let max = 0;
  for (const u of existing) {
    if (!u.startsWith(prefix)) continue;
    const n = Number(u.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

const dataLimit = (plan: Plan) => (plan.dataGB === null ? 0 : plan.dataGB * GB); // Marzban 里 0 表示不限
const resetStrategy = (plan: Plan) => (plan.dataGB !== null && plan.dataReset === "month" ? "month" : "no_reset");

// POST /api/user 的请求体。
// 入站：inbounds 必须明确写成 {}，Marzban 才会把所有 VLESS 入站（每个节点一个）都勾上。
// 整个不写的话，Marzban 0.8.4 的校验不会运行（pydantic 不校验默认值），结果是一个入站都不勾，客人连不上。
// 不点名具体入站，以后加新的 VLESS 入站，这里不用改，已开的用户也会自动带上。
// 只开 VLESS，不开 Shadowsocks 等其他协议
export function newUserBody(username: string, plan: Plan, now: number) {
  return {
    username,
    proxies: { vless: { flow: "xtls-rprx-vision" } },
    inbounds: {},
    expire: now + plan.days * DAY,
    data_limit: dataLimit(plan),
    data_limit_reset_strategy: resetStrategy(plan),
    status: "active",
    note: setIpNote("", plan.ip),
  };
}

// 续期用的 PUT /api/user/{username} 请求体。流量另外调 reset 接口清零
export function renewUserBody(current: { expire: number | null; note?: string | null }, plan: Plan, now: number) {
  return {
    expire: renewedExpire(current.expire, plan.days, now),
    data_limit: dataLimit(plan),
    data_limit_reset_strategy: resetStrategy(plan),
    status: "active",
    note: setIpNote(current.note, plan.ip),
  };
}
