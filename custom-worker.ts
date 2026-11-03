// Worker 入口：在 OpenNext 生成的 worker 外面包一层，加上每天的定时任务（wrangler.jsonc 的 triggers.crons）。
// 定时任务在同一个 Worker 里直接调 /api/cron/expiry，带一个这次现生成的口令，路由只认这个口令，外面打不进来
// @ts-ignore .open-next/worker.js 是 opennextjs-cloudflare build 时生成的
import { default as handler } from "./.open-next/worker.js";

export default {
  fetch: handler.fetch,
  async scheduled(_event: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext) {
    const token = crypto.randomUUID();
    (globalThis as { __cronToken?: string }).__cronToken = token;
    const req = new Request("https://cron.internal/api/cron/expiry", { method: "POST", headers: { "x-cron-token": token } });
    ctx.waitUntil(
      Promise.resolve(handler.fetch(req, env, ctx))
        .then(async (res: Response) => console.log(`cron expiry: ${res.status} ${await res.text()}`))
        .finally(() => {
          (globalThis as { __cronToken?: string }).__cronToken = undefined;
        }),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
