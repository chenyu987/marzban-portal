// 管理员「我的账户」页用到的纯逻辑：认设备、偏好表单、日志里各种操作的中文名
import { PAGE_SIZES, SORTS } from "./admin-users";
import type { Lang } from "./i18n";

// 操作日志里 action 的中文名（日志页、账户页「我的操作」共用）
export const LOG_ACTIONS: Record<string, string> = {
  login: "登录",
  "login.fail": "登录失败",
  logout: "退出",
  "order.confirm": "确认订单",
  "order.verify": "对账：确认到账",
  "order.revoke": "对账：没收到钱收回",
  "order.cancel": "取消订单",
  "balance.adjust": "加减余额",
  "password.reset_link": "生成重置链接",
  "subscription.bind": "绑定订阅",
  "subscription.auto_bind": "微信号对上，自动绑定订阅",
  "codes.create": "生成兑换码",
  "code.void": "作废兑换码",
  "user.create": "新建订阅",
  "user.edit": "修改订阅",
  "user.reset_usage": "流量清零",
  "user.revoke_sub": "重置订阅链接",
  "user.delete": "删除订阅",
  "user.change_plan": "改套餐",
  "user.set_wechat": "记微信号",
  "node.add": "加节点",
  "node.edit": "修改节点",
  "node.enable": "启用节点",
  "node.disable": "停用节点",
  "node.reconnect": "重连节点",
  "node.delete": "删除节点",
  "core.restart": "重启 Xray",
  "hosts.save": "保存 Host",
  "dns.switch": "切换域名 IP",
  "standby.apply": "备用机换角色",
  "probe.down": "检测到疑似被墙",
  "probe.up": "检测到恢复",
  "users.delete_expired": "删除过期订阅",
  "users.reset_all_usage": "全部流量清零",
  "customer.delete": "删除客人",
  "account.password": "改自己的密码",
  "account.logout_others": "退出其他设备",
  "account.prefs": "改后台偏好",
};
const LOG_ACTIONS_EN: Record<string, string> = {
  login: "Log in",
  "login.fail": "Failed login",
  logout: "Log out",
  "order.confirm": "Confirm order",
  "order.verify": "Reconcile: received",
  "order.revoke": "Reconcile: not received, revoked",
  "order.cancel": "Cancel order",
  "balance.adjust": "Adjust balance",
  "password.reset_link": "Create reset link",
  "subscription.bind": "Link subscription",
  "subscription.auto_bind": "Auto-link by WeChat ID",
  "codes.create": "Create codes",
  "code.void": "Void code",
  "user.create": "Create subscription",
  "user.edit": "Edit subscription",
  "user.reset_usage": "Reset traffic",
  "user.revoke_sub": "Reset subscription link",
  "user.delete": "Delete subscription",
  "user.change_plan": "Change plan",
  "user.set_wechat": "Record WeChat ID",
  "node.add": "Add node",
  "node.edit": "Edit node",
  "node.enable": "Enable node",
  "node.disable": "Disable node",
  "node.reconnect": "Reconnect node",
  "node.delete": "Delete node",
  "core.restart": "Restart Xray",
  "hosts.save": "Save Hosts",
  "dns.switch": "Switch domain IP",
  "standby.apply": "Standby role change",
  "probe.down": "Possible block detected",
  "probe.up": "Recovery detected",
  "users.delete_expired": "Delete expired subscriptions",
  "users.reset_all_usage": "Reset all traffic",
  "customer.delete": "Delete customer",
  "account.password": "Change own password",
  "account.logout_others": "Log out other devices",
  "account.prefs": "Change admin preferences",
};
export const logActionLabels = (lang: Lang = "zh"): Record<string, string> => (lang === "en" ? LOG_ACTIONS_EN : LOG_ACTIONS);

// 从 User-Agent 认出「Mac · Chrome」「iPhone · Safari」，账户页列登录设备用。认不出就写「未知设备」
export function describeDevice(ua: string | null | undefined, lang: Lang = "zh"): string {
  const unknown = lang === "en" ? "Unknown device" : "未知设备";
  if (!ua) return unknown;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : "";
  // 顺序有讲究：Edge、微信、Chrome 的 UA 里都带 Safari，Edge 还带 Chrome
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /MicroMessenger/.test(ua)
      ? lang === "en"
        ? "WeChat"
        : "微信"
      : /Firefox\/|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome\/|CriOS/.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "";
  return [os, browser].filter(Boolean).join(" · ") || unknown;
}

// 后台偏好表单：每页多少个、默认排序、时间怎么显示。空 = 用默认
export function parsePrefsForm(
  get: (k: string) => string,
  lang: Lang = "zh",
): { prefs: { pageSize: number | null; sort: string | null; time: "relative" | "absolute" } } | { error: string } {
  const en = lang === "en";
  const size = get("page_size").trim();
  const sort = get("sort").trim();
  const time = get("time").trim() || "relative";
  if (size && !(PAGE_SIZES as readonly number[]).includes(Number(size))) return { error: en ? "Pick a page size from the list" : "每页个数只能选列表里的" };
  if (sort && !(sort in SORTS)) return { error: en ? "Invalid sort" : "排序方式不对" };
  if (time !== "relative" && time !== "absolute") return { error: en ? "Invalid time display" : "时间显示方式不对" };
  return { prefs: { pageSize: size ? Number(size) : null, sort: sort || null, time } };
}
