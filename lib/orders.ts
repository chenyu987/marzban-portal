// 服务端共用的开通逻辑：客人网页（兑换码、余额购买）和管理后台确认订单都用。
// 不放在 app/actions.ts 里：那个文件 export 的函数都会变成浏览器能直接调用的 Server Action
import "server-only";
import { db } from "./env";
import { createUser, findUser, modifyUser, resetUsage, vlessInbounds } from "./marzban";
import { nextUsername } from "./plans";
import { provisionNew, provisionRenew, type ProvisionOps, type ProvisionResult } from "./provision";
import type { Plan } from "../site.config.example";
import { site } from "../site.config";
import { makeT, type Lang } from "./i18n";

// 网页这边的 Marzban 操作，交给 lib/provision.ts 判断出错时 Marzban 改没改
const marzbanOps: ProvisionOps = { findUser, createUser, modifyUser, resetUsage, vlessInbounds, proOnly: site.proOnlyInbounds };

// 按 target（"new" 或客人名下的用户名）在 Marzban 上新开或续期。兑换码和余额购买共用。
// 返回 { error }：写 Marzban 之前就发现不行；抛异常：写之前出了意外。这两种 Marzban 都没动过，调用方可以放心退款/放回兑换码。
// 其他情况返回 lib/provision.ts 的结果（done / retry / stuck）
export async function provisionTarget(
  customerId: number,
  subs: string[],
  target: string,
  plan: Plan,
  now: number,
  lang: Lang = "zh",
): Promise<{ error: string } | ProvisionResult> {
  const t = makeT(lang);
  if (target === "new") {
    // 用户名用客人的微信号，管理员在面板里一眼看出是谁
    const c = await db().prepare("SELECT wechat FROM customers WHERE id = ?").bind(customerId).first<{ wechat: string | null }>();
    let username = nextUsername(customerId, subs, c?.wechat);
    // 名字被占了就序号往后挪：Marzban 上已经有（管理员手动建过、别人的微信号转出来一样），
    // 或者库里还绑着（Marzban 上被手动删了但绑定还在，再用会撞唯一约束）
    const taken = async (name: string) =>
      !!(await db().prepare("SELECT 1 FROM subscriptions WHERE marzban_username = ?").bind(name).first()) || !!(await findUser(name));
    while (await taken(username)) username = nextUsername(customerId, [...subs, username], c?.wechat);
    return provisionNew(marzbanOps, username, plan, now);
  }
  const current = await findUser(target);
  if (!current) return { error: t("暂时查不到这个订阅，请稍后再试或联系客服", "Can't find this subscription right now. Please try again later or contact support") };
  if (!current.expire)
    return { error: t("这个订阅永不到期，不用续期。可以选「新开一个订阅」", "This subscription never expires, so it doesn't need renewing. You can choose \"New subscription\" instead") };
  return provisionRenew(marzbanOps, current, plan, now);
}

