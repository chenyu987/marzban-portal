// 直接用 node 跑 wrangler，不经过 npx：Windows 上 npx 是 npx.cmd，不开 shell 起不来，
// 开 shell 又会把 SQL 里的引号和换行搞乱。同 scripts/admin.mjs 里的 wrangler()
import { execFileSync } from "node:child_process";

export const wrangler = (args: string[]) =>
  execFileSync(process.execPath, ["node_modules/wrangler/bin/wrangler.js", ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
