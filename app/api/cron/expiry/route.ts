// 到期提醒的入口。线上由 custom-worker.ts 的定时任务（每天北京时间 10 点）在同一个 Worker 里直接调用，
// 带上它刚生成的一次性口令；外面的请求拿不到口令，一律 404。本地开发（next dev）不用口令，e2e 直接调
import { runExpiryReminders } from "@/lib/expiry-reminders";
import { nowSec } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const tokens = (globalThis as { __cronTokens?: Set<string> }).__cronTokens;
  const given = req.headers.get("x-cron-token");
  const ok = process.env.NODE_ENV === "development" || (!!given && !!tokens?.has(given));
  if (!ok) return new Response("Not found", { status: 404 });
  // e2e 可以传 ?now= 模拟某个时间
  const nowParam = Number(new URL(req.url).searchParams.get("now"));
  const now = process.env.NODE_ENV === "development" && nowParam > 0 ? nowParam : nowSec();
  const result = await runExpiryReminders(now);
  console.log(`expiry: 查了 ${result.checked} 个订阅，发了 ${result.sent} 封，失败 ${result.failed} 封`);
  return Response.json(result);
}
