// Worker 入口：在 OpenNext 生成的 worker 外面包一层，加上定时任务（wrangler.jsonc 的 triggers.crons）：
// 每天一次的到期提醒（/api/cron/expiry）、每 5 分钟的节点掉线提醒（/api/cron/nodes）。
// 在同一个 Worker 里直接调这两个路由，带一个这次现生成的口令，路由只认这个口令，外面打不进来
// @ts-ignore .open-next/worker.js 是 opennextjs-cloudflare build 时生成的
import { default as handler } from "./.open-next/worker.js";
import { httpsRedirect } from "./lib/https-redirect";
import { adminRootRedirect } from "./lib/admin-root";

export default {
  fetch: (request: Request, env: CloudflareEnv, ctx: ExecutionContext) => httpsRedirect(request) ?? adminRootRedirect(request) ?? handler.fetch(request, env, ctx),
  async scheduled(event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    const job = event.cron === "*/5 * * * *" ? "nodes" : "expiry";
    // 两个任务可能同一分钟触发，口令各用各的，放在一个集合里
    const token = crypto.randomUUID();
    const g = globalThis as { __cronTokens?: Set<string> };
    (g.__cronTokens ??= new Set()).add(token);
    const req = new Request(`https://cron.internal/api/cron/${job}`, { method: "POST", headers: { "x-cron-token": token } });
    ctx.waitUntil(
      Promise.resolve(handler.fetch(req, env, ctx))
        .then(async (res: Response) => console.log(`cron ${job}: ${res.status} ${await res.text()}`))
        .finally(() => {
          g.__cronTokens?.delete(token);
        }),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
