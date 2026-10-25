// 发邮件。现在接的是 Resend（https://resend.com，免费版每月 3000 封），只用它的一个 HTTP 接口，换别家只改这个文件。
// 配置（都不进 git）：
//   RESEND_API_KEY  Resend 的 API key，线上用 `wrangler secret put RESEND_API_KEY`
//   MAIL_FROM       发件人，比如 "Portal <no-reply@mail.example.com>"，域名要先在 Resend 验证过
//   MAIL_DEV_LOG=1  本地开发用：不真发，把邮件内容打印到终端
// 两个都没配就是「还不能发邮件」，canSendMail() 返回 false，页面会让客人联系管理员
import { env } from "./env";

type MailEnv = { RESEND_API_KEY?: string; MAIL_FROM?: string; MAIL_DEV_LOG?: string };
const mailEnv = () => env() as unknown as MailEnv;

export function canSendMail(): boolean {
  const e = mailEnv();
  return e.MAIL_DEV_LOG === "1" || (!!e.RESEND_API_KEY && !!e.MAIL_FROM);
}

// 发成功返回 true。失败只记日志、返回 false，不把服务商的报错给客人看
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const e = mailEnv();
  if (e.MAIL_DEV_LOG === "1") {
    console.log(`[mail] 收件人 ${to}\n主题：${subject}\n${text}`);
    return true;
  }
  if (!e.RESEND_API_KEY || !e.MAIL_FROM) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.MAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) {
      console.error(`mail: Resend 返回 ${res.status}：${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("mail: 发送失败", err);
    return false;
  }
}
