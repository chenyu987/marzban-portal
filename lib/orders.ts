// 服务端共用的开通逻辑：客人网页（兑换码、余额购买）和管理后台确认订单都用。
// 不放在 app/actions.ts 里：那个文件 export 的函数都会变成浏览器能直接调用的 Server Action
import "server-only";
import { db } from "./env";
import { createUser, findUser, modifyUser, resetUsage } from "./marzban";
import { nextUsername } from "./plans";
import { provisionNew, provisionRenew, type ProvisionOps, type ProvisionResult } from "./provision";
import type { Plan } from "../site.config.example";

// 网页这边的 Marzban 操作，交给 lib/provision.ts 判断出错时 Marzban 改没改
const marzbanOps: ProvisionOps = { findUser, createUser, modifyUser, resetUsage };

// 按 target（"new" 或客人名下的用户名）在 Marzban 上新开或续期。兑换码和余额购买共用。
// 返回 { error }：写 Marzban 之前就发现不行；抛异常：写之前出了意外。这两种 Marzban 都没动过，调用方可以放心退款/放回兑换码。
// 其他情况返回 lib/provision.ts 的结果（done / retry / stuck）
export async function provisionTarget(
  customerId: number,
  subs: string[],
  target: string,
  plan: Plan,
  now: number,
): Promise<{ error: string } | ProvisionResult> {
  if (target === "new") {
    // 用户名用客人的微信号，管理员在面板里一眼看出是谁
    const c = await db().prepare("SELECT wechat FROM customers WHERE id = ?").bind(customerId).first<{ wechat: string | null }>();
    let username = nextUsername(customerId, subs, c?.wechat);
    // Marzban 上万一已经有同名用户（管理员手动建过、或者别人的微信号转出来一样），序号往后挪
    while (await findUser(username)) username = nextUsername(customerId, [...subs, username], c?.wechat);
    return provisionNew(marzbanOps, username, plan, now);
  }
  const current = await findUser(target);
  if (!current) return { error: "暂时查不到这个订阅，请稍后再试或联系管理员" };
  if (!current.expire) return { error: "这个订阅永不到期，不用续期。可以选「新开一个订阅」" };
  return provisionRenew(marzbanOps, current, plan, now);
}

