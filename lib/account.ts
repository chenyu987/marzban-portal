// 客人账号的校验：注册和「账户」页共用。只放纯函数，方便单测
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 微信号是 6–20 位字母、数字、下划线、减号；没设微信号的人会填绑定的手机号（11 位数字），也能搜到
export const WECHAT_RE = /^[A-Za-z0-9_-]{5,30}$/;
export const PASSWORD_MIN = 8;

// 常用客户端：订阅页上它的导入按钮排最前
export const CLIENTS = { shadowrocket: "Shadowrocket", clash: "Clash Verge", hiddify: "Hiddify" } as const;
export type ClientId = keyof typeof CLIENTS;

export function emailError(email: string): string | null {
  return EMAIL_RE.test(email) ? null : "邮箱格式不对";
}

export function wechatError(wechat: string): string | null {
  if (!wechat) return "请填微信号，方便客服联系你";
  if (!WECHAT_RE.test(wechat)) return "微信号格式不对：只能是字母、数字、下划线或减号，也可以填微信绑定的手机号";
  return null;
}

export function passwordError(password: string): string | null {
  return password.length < PASSWORD_MIN ? `密码至少 ${PASSWORD_MIN} 位` : null;
}

export function isClient(v: string): v is ClientId {
  return v in CLIENTS;
}

// 按常用客户端把导入按钮排一下：选了的排最前，其余保持原来的顺序
export function orderClients<T extends { id: ClientId }>(list: T[], preferred: string | null | undefined): T[] {
  if (!preferred || !isClient(preferred)) return list;
  return [...list.filter((c) => c.id === preferred), ...list.filter((c) => c.id !== preferred)];
}
