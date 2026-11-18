// 套餐怎么落到 Marzban 用户上：新开时的请求体、续期后的到期时间、备注里的 ip=N。
// 只放纯函数，网页和命令行脚本共用（脚本用 node 直接跑，这里不要引入运行时依赖）
import type { Plan } from "../site.config.example";

const DAY = 86400;
const GB = 1024 ** 3;

export function findPlan(plans: Plan[], id: string): Plan | undefined {
  return plans.find((p) => p.id === id);
}

// 客人能自己买的套餐：去掉只能用兑换码开的（免费体验之类）
export function forSale(plans: Plan[]): Plan[] {
  return plans.filter((p) => !p.codeOnly);
}

// 一句话说清流量，套餐页和订阅卡片共用
export function describePlan(p: Plan, lang: "zh" | "en" = "zh"): string {
  if (p.dataGB === null) return lang === "en" ? "Unlimited data" : "不限流量";
  return `${p.dataGB} GB${p.dataReset === "month" ? (lang === "en" ? "/mo" : "/月") : ""}`;
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

// 微信号转成 Marzban 能用的用户名：只留小写字母、数字、下划线（减号换成下划线），最长 28 位给序号留位置。
// 转出来不够 3 位就不用，返回 null
export function wechatUsername(wechat: string | null | undefined): string | null {
  const base = (wechat ?? "").toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 28);
  return base.length >= 3 ? base : null;
}

// 这个 Marzban 用户名是不是按这个微信号起的（nextUsername 的规则：微信号本身，或者 微信号_2、_3…）
export function isWechatUsername(wechat: string | null | undefined, username: string): boolean {
  const base = wechatUsername(wechat);
  if (!base) return false;
  return username === base || (username.startsWith(`${base}_`) && /^\d+$/.test(username.slice(base.length + 1)));
}

// Marzban 用户名：管理员在面板里一眼看出是谁，所以用客人的微信号，第一个就叫微信号，再开的接着 _2、_3 往下排。
// 没有微信号的老客人用 c<客人id>_<序号>。不带邮箱，因为用户名会显示在客人的订阅页上
export function nextUsername(customerId: number, existing: string[], wechat?: string | null): string {
  const base = wechatUsername(wechat);
  const prefix = base ? `${base}_` : `c${customerId}_`;
  let max = 0;
  for (const u of existing) {
    if (base && u === base) max = Math.max(max, 1);
    if (!u.startsWith(prefix)) continue;
    const n = Number(u.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return base && max === 0 ? base : `${prefix}${max + 1}`;
}

// 这个套餐该勾哪些 VLESS 入站。all 是 Marzban 上现有的全部 VLESS 入站（GET /api/inbounds）。
// Pro 全勾；Basic 去掉 proOnly 里的。proOnly 空着表示不分档，返回 undefined：开通时照旧让 Marzban 全勾，续期不动入站
export function planInbounds(plan: Plan, all: string[], proOnly: string[] | undefined): string[] | undefined {
  if (!proOnly?.length) return undefined;
  const tags = plan.pro ? all : all.filter((t) => !proOnly.includes(t));
  if (!tags.length) throw new Error(`套餐 ${plan.id} 一个 VLESS 入站都分不到，检查 proOnlyInbounds 和 Marzban 上的入站`);
  return tags;
}

const dataLimit = (plan: Plan) => (plan.dataGB === null ? 0 : plan.dataGB * GB); // Marzban 里 0 表示不限
const resetStrategy = (plan: Plan) => (plan.dataGB !== null && plan.dataReset === "month" ? "month" : "no_reset");

// POST /api/user 的请求体。
// 入站：inbounds 必须明确写成 {}，Marzban 才会把所有 VLESS 入站（每个节点一个）都勾上。
// 整个不写的话，Marzban 0.8.4 的校验不会运行（pydantic 不校验默认值），结果是一个入站都不勾，客人连不上。
// 不点名具体入站，以后加新的 VLESS 入站，这里不用改，已开的用户也会自动带上。
// 只开 VLESS，不开 Shadowsocks 等其他协议。
// 分档时传 vless（planInbounds 算出来的），只勾这些入站
export function newUserBody(username: string, plan: Plan, now: number, vless?: string[]) {
  return {
    username,
    proxies: { vless: { flow: "xtls-rprx-vision" } },
    inbounds: vless ? { vless } : {},
    expire: now + plan.days * DAY,
    data_limit: dataLimit(plan),
    data_limit_reset_strategy: resetStrategy(plan),
    status: "active",
    note: setIpNote("", plan.ip),
  };
}

// 改用户时的入站。Marzban 0.8.4 改用户时不会自动补全入站：没列出来的入站都会被取消勾选，
// 所以 vless 必须是完整的列表（planInbounds 给的就是）；不分档时不传，入站不动
const inboundsField = (vless?: string[]) => (vless ? { inbounds: { vless } } : {});

// 后台「改套餐」用的 PUT /api/user/{username} 请求体：只按新套餐改流量上限、重置方式、设备数（备注里的 ip=N）、档位对应的入站，到期时间不动
export function changePlanBody(current: { note?: string | null }, plan: Plan, vless?: string[]) {
  return {
    data_limit: dataLimit(plan),
    data_limit_reset_strategy: resetStrategy(plan),
    note: setIpNote(current.note, plan.ip),
    ...inboundsField(vless),
  };
}

// 续期用的 PUT /api/user/{username} 请求体。流量另外调 reset 接口清零。入站按新套餐的档位改（Basic 续 Pro 就加上 Pro 的节点）
export function renewUserBody(current: { expire: number | null; note?: string | null }, plan: Plan, now: number, vless?: string[]) {
  return {
    expire: renewedExpire(current.expire, plan.days, now),
    data_limit: dataLimit(plan),
    data_limit_reset_strategy: resetStrategy(plan),
    status: "active",
    note: setIpNote(current.note, plan.ip),
    ...inboundsField(vless),
  };
}

// 升级套餐：到期时间不变，只补剩下天数的差价。
// 按两档月付价格算：(新档月付 − 旧档月付) ÷ 30 × 剩余天数，向上取整到元，最少 1 元。
// 只列月付价格更高的档；当前套餐查不到、是免费体验、已经到期、永不到期的都不能升级（返回空）
export type UpgradeOption = { plan: Plan; price: number };
export function upgradeOptions(plans: Plan[], currentId: string | undefined, expire: number | null, now: number): UpgradeOption[] {
  const current = currentId ? findPlan(plans, currentId) : undefined;
  if (!current || current.codeOnly || !expire || expire <= now) return [];
  const group = (p: Plan) => p.group ?? p.name;
  const monthly = (g: string) => forSale(plans).find((p) => group(p) === g && p.days === 30);
  const from = monthly(group(current));
  if (!from) return [];
  const days = Math.ceil((expire - now) / DAY);
  const seen = new Set<string>();
  const out: UpgradeOption[] = [];
  for (const p of forSale(plans)) {
    const g = group(p);
    if (seen.has(g)) continue;
    seen.add(g);
    const to = monthly(g);
    if (!to || to.price <= from.price) continue;
    const yuan = Math.max(1, Math.ceil(((to.price - from.price) * days) / 30 / 100));
    out.push({ plan: to, price: yuan * 100 });
  }
  return out;
}
