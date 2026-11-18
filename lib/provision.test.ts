import { describe, expect, it, vi } from "vitest";
import type { Plan } from "../site.config.example";
import { provisionNew, provisionRenew, provisionUpgrade, type ProvisionOps, type ProvisionUser } from "./provision";

const DAY = 86400;
const NOW = 1_800_000_000;
const plan: Plan = { id: "p3-month", name: "高速版 月付", price: 4500, days: 30, dataGB: null, ip: 2 };

// 一个假的 Marzban：内存里存用户，可以指定某个操作「失败」以及失败时到底改没改
function fakeMarzban(users: Record<string, ProvisionUser> = {}) {
  const store = new Map(Object.entries(users));
  const ops = {
    findUser: vi.fn(async (u: string) => store.get(u) ?? null),
    createUser: vi.fn(async (b: { username: string; expire: number }) => {
      const u: ProvisionUser = { username: b.username, expire: b.expire, note: null };
      store.set(b.username, u);
      return u;
    }),
    modifyUser: vi.fn(async (u: string, b: { expire: number }) => {
      const cur = { ...store.get(u)!, expire: b.expire };
      store.set(u, cur);
      return cur;
    }),
    resetUsage: vi.fn(async () => ({})),
  };
  return { ops: ops as unknown as ProvisionOps & typeof ops, store };
}

// 让某个操作先真的执行、再抛错：模拟「请求成功了但响应丢了」
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...a: any[]) => Promise<unknown>;
function appliedThenThrow(mock: { getMockImplementation(): AnyFn | undefined }) {
  const real = mock.getMockImplementation()!;
  return async (...a: Parameters<AnyFn>) => {
    await real(...a);
    throw new Error("timeout");
  };
}

describe("provisionNew", () => {
  it("建出来的用户没勾入站：不算成功，交给管理员", async () => {
    const { ops } = fakeMarzban();
    ops.createUser.mockImplementationOnce(async (b) => ({ username: b.username, expire: b.expire, inbounds: { vless: [] } }));
    const r = await provisionNew(ops, "c1_1", plan, NOW);
    expect(r).toMatchObject({ kind: "stuck", username: "c1_1" });
  });
  it("勾上了入站就算成功", async () => {
    const { ops } = fakeMarzban();
    ops.createUser.mockImplementationOnce(async (b) => ({ username: b.username, expire: b.expire, inbounds: { vless: ["A", "B", "C"] } }));
    expect(await provisionNew(ops, "c1_1", plan, NOW)).toMatchObject({ kind: "done" });
  });

  it("正常新建", async () => {
    const { ops } = fakeMarzban();
    const r = await provisionNew(ops, "c1_1", plan, NOW);
    expect(r).toEqual({ kind: "done", username: "c1_1", expire: NOW + 30 * DAY });
  });

  it("请求其实成功了但报错：查到用户已存在，当作成功，不能让客人重试", async () => {
    const { ops } = fakeMarzban();
    ops.createUser.mockImplementationOnce(appliedThenThrow(ops.createUser));
    const r = await provisionNew(ops, "c1_1", plan, NOW);
    expect(r).toEqual({ kind: "done", username: "c1_1", expire: NOW + 30 * DAY });
  });

  it("确实没建成：可以放回兑换码重试", async () => {
    const { ops } = fakeMarzban();
    ops.createUser.mockRejectedValueOnce(new Error("500"));
    const r = await provisionNew(ops, "c1_1", plan, NOW);
    expect(r.kind).toBe("retry");
  });

  it("报错之后连查都查不了：保留兑换码，交给管理员", async () => {
    const { ops } = fakeMarzban();
    ops.createUser.mockRejectedValueOnce(new Error("timeout"));
    ops.findUser.mockRejectedValueOnce(new Error("network down"));
    const r = await provisionNew(ops, "c1_1", plan, NOW);
    expect(r).toMatchObject({ kind: "stuck", username: "c1_1" });
  });
});

describe("provisionRenew", () => {
  const alice = { username: "alice", expire: NOW + 20 * DAY, note: "ip=3" };

  it("正常续期：到期时间加 30 天，流量清零", async () => {
    const { ops } = fakeMarzban({ alice });
    const r = await provisionRenew(ops, alice, plan, NOW);
    expect(r).toEqual({ kind: "done", username: "alice", expire: NOW + 50 * DAY });
    expect(ops.resetUsage).toHaveBeenCalledWith("alice");
  });

  it("到期时间续上了但流量清零失败：仍然算成功（不能放回兑换码），带警告", async () => {
    // 这就是线上会出的问题：以前这里会放回兑换码，客人再兑一次就多续 30 天
    const { ops, store } = fakeMarzban({ alice });
    ops.resetUsage.mockRejectedValueOnce(new Error("500"));
    const r = await provisionRenew(ops, alice, plan, NOW);
    expect(r).toMatchObject({ kind: "done", username: "alice", expire: NOW + 50 * DAY });
    expect(r.kind === "done" && r.warning).toBeTruthy();
    expect(store.get("alice")!.expire).toBe(NOW + 50 * DAY);
  });

  it("续期请求其实成功了但报错：查到到期时间已经变了，当作成功", async () => {
    const { ops } = fakeMarzban({ alice });
    ops.modifyUser.mockImplementationOnce(appliedThenThrow(ops.modifyUser));
    const r = await provisionRenew(ops, alice, plan, NOW);
    expect(r).toMatchObject({ kind: "done", expire: NOW + 50 * DAY });
    expect(ops.resetUsage).toHaveBeenCalled();
  });

  it("续期确实没成功（到期时间没变）：可以放回兑换码重试", async () => {
    const { ops } = fakeMarzban({ alice });
    ops.modifyUser.mockRejectedValueOnce(new Error("500"));
    const r = await provisionRenew(ops, alice, plan, NOW);
    expect(r.kind).toBe("retry");
    expect(ops.resetUsage).not.toHaveBeenCalled();
  });

  it("报错之后到期时间对不上（被别人改过）：保留兑换码，交给管理员", async () => {
    const { ops, store } = fakeMarzban({ alice });
    ops.modifyUser.mockImplementationOnce(async () => {
      store.set("alice", { ...alice, expire: NOW + 99 * DAY });
      throw new Error("timeout");
    });
    const r = await provisionRenew(ops, alice, plan, NOW);
    expect(r).toMatchObject({ kind: "stuck", username: "alice" });
  });

  it("报错之后查不了状态：保留兑换码，交给管理员", async () => {
    const { ops } = fakeMarzban({ alice });
    ops.modifyUser.mockRejectedValueOnce(new Error("timeout"));
    ops.findUser.mockRejectedValueOnce(new Error("network down"));
    const r = await provisionRenew(ops, alice, plan, NOW);
    expect(r).toMatchObject({ kind: "stuck", username: "alice" });
  });
});

describe("分档", () => {
  const ALL = ["VLESS TCP REALITY", "VLESS OSK", "VLESS LAX"];
  const tiered = (users: Record<string, ProvisionUser> = {}) => {
    const f = fakeMarzban(users);
    const vlessInbounds = vi.fn(async () => ALL);
    return { ops: Object.assign(f.ops, { vlessInbounds, proOnly: ["VLESS LAX"] }), store: f.store };
  };
  const alice: ProvisionUser = { username: "alice", expire: NOW + 5 * DAY, note: "ip=2" };

  it("Basic 新开不勾 Pro 的入站，Pro 全勾", async () => {
    const { ops } = tiered();
    await provisionNew(ops, "c1_1", plan, NOW);
    expect(ops.createUser.mock.calls[0][0]).toMatchObject({ inbounds: { vless: ["VLESS TCP REALITY", "VLESS OSK"] } });
    await provisionNew(ops, "c1_2", { ...plan, pro: true }, NOW);
    expect(ops.createUser.mock.calls[1][0]).toMatchObject({ inbounds: { vless: ALL } });
  });

  it("续期按新套餐的档位改入站，列的是完整列表", async () => {
    const { ops } = tiered({ alice });
    await provisionRenew(ops, alice, { ...plan, pro: true }, NOW);
    expect(ops.modifyUser.mock.calls[0][1]).toMatchObject({ inbounds: { vless: ALL } });
  });

  it("查入站失败：Marzban 还没动，可以重试", async () => {
    const { ops } = tiered({ alice });
    ops.vlessInbounds.mockRejectedValueOnce(new Error("timeout"));
    expect(await provisionRenew(ops, alice, plan, NOW)).toMatchObject({ kind: "retry" });
    expect(ops.modifyUser).not.toHaveBeenCalled();
  });

  it("不分档时不查入站，请求体和以前一样", async () => {
    const { ops } = fakeMarzban({ alice });
    await provisionRenew(ops, alice, plan, NOW);
    expect(ops.modifyUser.mock.calls[0][1]).not.toHaveProperty("inbounds");
  });
});

describe("升级套餐", () => {
  const p4: Plan = { id: "p4-month", name: "高速版双设备 月付", price: 5800, days: 30, dataGB: null, ip: 3 };
  const alice = (): ProvisionUser => ({ username: "alice", expire: NOW + 20 * DAY, note: "ip=2" });

  it("到期时间不变，只改设备数", async () => {
    const { ops } = fakeMarzban({ alice: alice() });
    const r = await provisionUpgrade(ops, alice(), p4);
    expect(r).toEqual({ kind: "done", username: "alice", expire: NOW + 20 * DAY });
    const body = ops.modifyUser.mock.calls[0][1] as Record<string, unknown>;
    expect(body.note).toBe("ip=3");
    expect(body).not.toHaveProperty("expire");
    expect(ops.resetUsage).not.toHaveBeenCalled();
  });

  it("请求报错但其实改好了：当成功", async () => {
    const { ops, store } = fakeMarzban({ alice: alice() });
    ops.modifyUser.mockImplementationOnce(async (u: string) => {
      store.set(u, { ...store.get(u)!, note: "ip=3" });
      throw new Error("timeout");
    });
    expect((await provisionUpgrade(ops, alice(), p4)).kind).toBe("done");
  });

  it("请求报错、确实没改：可以重试", async () => {
    const { ops } = fakeMarzban({ alice: alice() });
    ops.modifyUser.mockRejectedValueOnce(new Error("502"));
    expect((await provisionUpgrade(ops, alice(), p4)).kind).toBe("retry");
  });
});
