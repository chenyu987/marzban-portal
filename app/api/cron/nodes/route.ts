// 节点掉线提醒的入口。线上由 custom-worker.ts 的定时任务（每 5 分钟）在同一个 Worker 里直接调用，带一次性口令；
// 外面的请求拿不到口令，一律 404。本地开发不用口令，e2e 直接调，可以传 ?now= 模拟时间
import { runNodeAlerts } from "@/lib/admin-alerts";
import { nowSec } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const tokens = (globalThis as { __cronTokens?: Set<string> }).__cronTokens;
  const given = req.headers.get("x-cron-token");
  const ok = process.env.NODE_ENV === "development" || (!!given && !!tokens?.has(given));
  if (!ok) return new Response("Not found", { status: 404 });
  const nowParam = Number(new URL(req.url).searchParams.get("now"));
  const now = process.env.NODE_ENV === "development" && nowParam > 0 ? nowParam : nowSec();
  const result = await runNodeAlerts(now);
  if (result.down || result.sent) console.log(`nodes: ${result.down} 个掉线，发了 ${result.sent} 封`);
  return Response.json(result);
}
