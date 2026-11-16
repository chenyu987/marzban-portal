// 跑测试前：确认只连本地假 Marzban，并把本地数据库的结构更新到最新
import { readFileSync } from "node:fs";
import { wrangler } from "./wrangler";

export default function setup() {
  const vars = readFileSync(".dev.vars", "utf8");
  const url = /^MARZBAN_URL\s*=\s*(.*)$/m.exec(vars)?.[1]?.trim() ?? "";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url)) {
    throw new Error(`.dev.vars 的 MARZBAN_URL 是 ${url}，不是本地假 Marzban。端到端测试会开订阅、改到期时间，不能连线上`);
  }
  if (!/^MAIL_DEV_LOG\s*=\s*1\s*$/m.test(vars)) {
    throw new Error(".dev.vars 里要有 MAIL_DEV_LOG=1（见 .dev.vars.example），忘记密码的测试才能跑");
  }
  if (!/^ADMIN_DEV_NO_ACCESS\s*=\s*1\s*$/m.test(vars)) {
    throw new Error(".dev.vars 里要有 ADMIN_DEV_NO_ACCESS=1（见 .dev.vars.example），管理后台的测试才能跑");
  }
  wrangler(["d1", "migrations", "apply", "DB", "--local"]);
}
