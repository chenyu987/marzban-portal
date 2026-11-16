// 微信推送：最紧急的管理员提醒（国内检测到疑似被墙、节点掉线 / 恢复）除了发邮件，再推一条到管理员微信。
// 现在接的是 Server酱（https://sct.ftqq.com，微信扫码登录，免费版每天 5 条），换别家只改这个文件。
// 配置（不进 git）：
//   SERVERCHAN_SENDKEY  Server酱 的 SendKey，线上用 `wrangler secret put SERVERCHAN_SENDKEY`；推给几个人就写几个，逗号隔开
//   MAIL_DEV_LOG=1      本地开发：不真推，把内容打印到终端（和邮件同一个开关）
// 没配就不推，不影响邮件
import { env } from "./env";

type PushEnv = { SERVERCHAN_SENDKEY?: string; MAIL_DEV_LOG?: string };
const pushEnv = () => env() as unknown as PushEnv;

// Server酱 的标题最多 32 个字，正文支持 Markdown（换行要空一行才分段）
export function pushBody(title: string, text: string): { title: string; desp: string } {
  const t = title.length > 32 ? `${title.slice(0, 31)}…` : title;
  return { title: t, desp: text.replace(/(?<!\n)\n(?!\n)/g, "\n\n").slice(0, 8000) };
}

// SendKey 长得像 SCT 开头的一串字母数字；不像的跳过，不往外发。
// 要推给几个人就写几个，用逗号隔开（每人各注册一个 Server酱，各有自己每天 5 条的额度）
const KEY_RE = /^[A-Za-z0-9]{10,80}$/;
export const pushKeys = (raw: string | undefined | null): string[] => [...new Set((raw ?? "").split(/[,，\s]+/).filter((k) => KEY_RE.test(k)))];

async function pushOne(key: string, body: { title: string; desp: string }): Promise<boolean> {
  try {
    const res = await fetch(`https://sctapi.ftqq.com/${key}.send`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
    if (!res.ok || data.code !== 0) {
      console.error(`push: Server酱 返回 ${res.status}：${data.message ?? ""}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("push: 推送失败", err);
    return false;
  }
}

// 推给配置里的每个人，有一个成功就算成功
export async function sendPush(title: string, text: string): Promise<boolean> {
  const e = pushEnv();
  const body = pushBody(title, text);
  if (e.MAIL_DEV_LOG === "1") {
    console.log(`[push] ${body.title}\n${body.desp}`);
    return true;
  }
  const keys = pushKeys(e.SERVERCHAN_SENDKEY);
  if (!keys.length) return false;
  const results = await Promise.all(keys.map((k) => pushOne(k, body)));
  return results.some(Boolean);
}
