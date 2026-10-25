// 按套餐在 Marzban 上新开或续期一个用户，并且在出错时说清楚「Marzban 到底改没改」。
// 网页兑换码和命令行记账共用。不直接调 Marzban，由调用方传入 ops（网页用 lib/marzban.ts，脚本用自己的 fetch），
// 这样也方便单元测试（provision.test.ts）。
//
// 为什么要这样：写 Marzban 的请求可能「其实成功了，但响应没回来」。这时如果当成失败、把兑换码放回去，
// 客人再试一次就会多开一个用户、或者多续一次期。所以写请求一旦发出去：
//   - 能确认没改 → retry：调用方可以放回兑换码，让客人重试
//   - 能确认改了 → done：照常记账
//   - 确认不了   → stuck：兑换码不放回，交给管理员核对
import type { Plan } from "../site.config.example";
// 带 .ts 后缀：命令行脚本用 node 直接跑这个文件
import { newUserBody, renewUserBody } from "./plans.ts";

export type ProvisionUser = { username: string; expire: number | null; note?: string | null };

export type ProvisionOps = {
  // 查不到返回 null；网络或别的错误直接抛出
  findUser: (username: string) => Promise<ProvisionUser | null>;
  createUser: (body: ReturnType<typeof newUserBody>) => Promise<ProvisionUser>;
  modifyUser: (username: string, body: ReturnType<typeof renewUserBody>) => Promise<ProvisionUser>;
  resetUsage: (username: string) => Promise<unknown>;
};

export type ProvisionResult =
  // Marzban 已经开通/续期好了。warning：主要的改动成功了，但有附带的步骤没做成（比如流量清零），要告诉管理员
  | { kind: "done"; username: string; expire: number | null; warning?: string }
  // Marzban 什么都没改，可以放回兑换码让客人重试
  | { kind: "retry"; reason: string }
  // Marzban 可能已经改了，不能放回兑换码，要管理员核对
  | { kind: "stuck"; username: string; reason: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// 新开一个用户。username 由调用方挑好（要确认 Marzban 上没有同名用户）
export async function provisionNew(ops: ProvisionOps, username: string, plan: Plan, now: number): Promise<ProvisionResult> {
  try {
    const u = await ops.createUser(newUserBody(username, plan, now));
    return { kind: "done", username, expire: u.expire };
  } catch (e) {
    // 请求可能其实成功了：查一下这个用户在不在
    let existing: ProvisionUser | null;
    try {
      existing = await ops.findUser(username);
    } catch (e2) {
      return { kind: "stuck", username, reason: `新建 ${username} 出错（${errText(e)}），之后也查不到它在不在（${errText(e2)}）` };
    }
    if (existing) return { kind: "done", username, expire: existing.expire };
    return { kind: "retry", reason: `新建 ${username} 失败：${errText(e)}` };
  }
}

// 续期已有用户。current 是续期前从 Marzban 查到的用户（续期从它的到期时间往后加）
export async function provisionRenew(
  ops: ProvisionOps,
  current: ProvisionUser,
  plan: Plan,
  now: number,
): Promise<ProvisionResult> {
  const { username } = current;
  const body = renewUserBody(current, plan, now);
  let expire: number | null;
  try {
    expire = (await ops.modifyUser(username, body)).expire;
  } catch (e) {
    // 请求可能其实成功了：再查一次，看到期时间变没变
    let after: ProvisionUser | null;
    try {
      after = await ops.findUser(username);
    } catch (e2) {
      return { kind: "stuck", username, reason: `续期 ${username} 出错（${errText(e)}），之后也查不到它现在的状态（${errText(e2)}）` };
    }
    if (after && after.expire === body.expire) {
      expire = after.expire;
    } else if (after && after.expire === current.expire) {
      return { kind: "retry", reason: `续期 ${username} 失败：${errText(e)}` };
    } else {
      return { kind: "stuck", username, reason: `续期 ${username} 出错（${errText(e)}），之后到期时间对不上，需要人工核对` };
    }
  }

  // 到期时间已经续上了，流量清零失败也不能再放回兑换码，只提醒管理员补一下
  try {
    await ops.resetUsage(username);
    return { kind: "done", username, expire };
  } catch (e) {
    return { kind: "done", username, expire, warning: `已续期，但已用流量没能清零：${errText(e)}` };
  }
}
