// Cloudflare Turnstile 人机验证（注册、忘记密码用）。大多数人什么都不用点，看着可疑才弹一个勾选框。
// 两把 key 都是 Worker 的 secret：TURNSTILE_SITE_KEY（给浏览器用的，不怕公开）和 TURNSTILE_SECRET_KEY。
// 没配就整个关掉：页面不显示、后端不检查（本地开发和 e2e 就是这样）
import "server-only";
import { env } from "./env";

type TurnstileEnv = { TURNSTILE_SITE_KEY?: string; TURNSTILE_SECRET_KEY?: string };
const tsEnv = () => env() as unknown as TurnstileEnv;

export function turnstileSiteKey(): string | null {
  const e = tsEnv();
  return e.TURNSTILE_SITE_KEY && e.TURNSTILE_SECRET_KEY ? e.TURNSTILE_SITE_KEY : null;
}

// 表单里 Turnstile 自动带上的字段叫 cf-turnstile-response
export async function verifyTurnstile(form: FormData, ip: string): Promise<boolean> {
  const secret = tsEnv().TURNSTILE_SECRET_KEY;
  if (!secret || !tsEnv().TURNSTILE_SITE_KEY) return true;
  const token = String(form.get("cf-turnstile-response") ?? "");
  if (!token) return false;
  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (ip !== "local") body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    if (!data.success) console.warn("turnstile: 没通过", data["error-codes"]);
    return data.success === true;
  } catch (e) {
    // Cloudflare 那边出问题时放行，不能因为它让客人注册不了；还有按 IP 限次数兜着
    console.error("turnstile: 验证接口出错，先放行", e);
    return true;
  }
}
