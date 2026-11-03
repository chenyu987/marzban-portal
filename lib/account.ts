// 客人账号的校验：注册和「账户」页共用。只放纯函数，方便单测
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 微信号是 6–20 位字母、数字、下划线、减号；没设微信号的人会填绑定的手机号（11 位数字），也能搜到
export const WECHAT_RE = /^[A-Za-z0-9_-]{5,30}$/;
export const PASSWORD_MIN = 8;

// lang 不传就是中文
type Lang = "zh" | "en";

export function emailError(email: string, lang: Lang = "zh"): string | null {
  return EMAIL_RE.test(email) ? null : lang === "en" ? "That doesn't look like a valid email" : "邮箱格式不对";
}

export function wechatError(wechat: string, lang: Lang = "zh"): string | null {
  const en = lang === "en";
  if (!wechat) return en ? "Please enter your WeChat ID so support can reach you" : "请填微信号，方便客服联系你";
  if (!WECHAT_RE.test(wechat))
    return en
      ? "Invalid WeChat ID: use only letters, numbers, underscores or hyphens, or the phone number linked to your WeChat"
      : "微信号格式不对：只能是字母、数字、下划线或减号，也可以填微信绑定的手机号";
  return null;
}

export function passwordError(password: string, lang: Lang = "zh"): string | null {
  if (password.length >= PASSWORD_MIN) return null;
  return lang === "en" ? `Password must be at least ${PASSWORD_MIN} characters` : `密码至少 ${PASSWORD_MIN} 位`;
}
