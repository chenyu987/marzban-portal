// 按微信号自动认领订阅：客人注册或改微信号时，把还没绑在任何人名下、微信号对得上的订阅绑过来，「我的订阅」里马上能看到。
// 两种来源：
//   1. 老订阅：marzban_users.wechat 里管理员记下的「Marzban 用户名 ↔ 微信号」
//   2. 管理员在 Marzban 面板里按微信号起名建的用户（微信号本身，或者 微信号_2、_3…，规则同 nextUsername）。
//      记了微信号的老用户名不按这条认（老用户名是微信名，可能和别人的微信号撞上）
// 微信号没有验证，填了别人的微信号就能认领别人的订阅，所以每次认领都记进后台操作日志，管理员能看到、能解绑
import "server-only";
import { db, nowSec } from "./env";
import { listUsers } from "./marzban";
import { isWechatUsername, wechatUsername } from "./plans";
import { logAdmin } from "./admin";

export async function claimByWechat(customer: { id: number; email: string }, wechat: string): Promise<string[]> {
  if (!wechat) return [];
  const { results: legacy } = await db()
    .prepare(
      `SELECT w.marzban_username FROM marzban_users w
       WHERE w.wechat = ? COLLATE NOCASE
         AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.marzban_username = w.marzban_username)`,
    )
    .bind(wechat)
    .all<{ marzban_username: string }>();
  const names = new Set(legacy.map((r) => r.marzban_username));

  const base = wechatUsername(wechat);
  if (base) {
    let found: string[] = [];
    try {
      const { users } = await listUsers({ offset: 0, limit: 100, search: base });
      found = users.map((u) => u.username).filter((u) => isWechatUsername(wechat, u));
    } catch (e) {
      // Marzban 连不上不影响注册，下次改微信号时还会再认一次
      console.error(`claimByWechat: 查 Marzban 出错 customer=${customer.id}`, e);
    }
    if (found.length > 0) {
      const marks = found.map(() => "?").join(",");
      const { results: taken } = await db()
        .prepare(
          `SELECT marzban_username FROM subscriptions WHERE marzban_username IN (${marks})
           UNION SELECT marzban_username FROM marzban_users WHERE wechat IS NOT NULL AND marzban_username IN (${marks})`,
        )
        .bind(...found, ...found)
        .all<{ marzban_username: string }>();
      const skip = new Set(taken.map((r) => r.marzban_username));
      for (const u of found) if (!skip.has(u)) names.add(u);
    }
  }

  const claimed: string[] = [];
  for (const username of names) {
    // 同一时间别人也在认领的话，subscriptions.marzban_username 唯一，只会有一个成功。
    // 用 RETURNING 判断插没插进去：subscriptions 上有触发器，meta.changes 会把触发器改的行也算进去
    const r = await db()
      .prepare("INSERT OR IGNORE INTO subscriptions (customer_id, marzban_username, created_at) VALUES (?, ?, ?) RETURNING id")
      .bind(customer.id, username, nowSec())
      .first<{ id: number }>();
    if (!r) continue;
    claimed.push(username);
    await logAdmin({ id: null, email: "系统" }, "subscription.auto_bind", customer.email, `${username}（微信号 ${wechat} 对上）`);
  }
  return claimed;
}

// 客人改了微信号：已经绑在他名下的老订阅，marzban_users 里记的微信号跟着改，后台按新微信号也搜得到
export async function followWechatChange(customerId: number, wechat: string) {
  await db()
    .prepare(
      `UPDATE marzban_users SET wechat = ?
       WHERE wechat IS NOT NULL AND marzban_username IN (SELECT marzban_username FROM subscriptions WHERE customer_id = ?)`,
    )
    .bind(wechat, customerId)
    .run();
}
