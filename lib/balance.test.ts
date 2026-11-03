import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { AVAILABLE_SQL, BALANCE_SQL, REFERRAL_REWARDS_SQL } from "./balance";

// 用真的 SQLite 跑一遍所有迁移，验证触发器发奖励的规则
const MIGRATIONS = new URL("../migrations/", import.meta.url);

let db: DatabaseSync;

function customer(email: string, referredBy: number | null = null): number {
  const r = db
    .prepare("INSERT INTO customers (email, password_hash, referral_code, referred_by, created_at) VALUES (?, 'x', ?, ?, 1) RETURNING id")
    .get(email, email, referredBy) as { id: number };
  return r.id;
}

function pay(customerId: number, amount: number, status = "paid"): number {
  const r = db
    .prepare("INSERT INTO orders (customer_id, amount, method, status, paid_at, created_at) VALUES (?, ?, 'manual', ?, 100, 100) RETURNING id")
    .get(customerId, amount, status) as { id: number };
  return r.id;
}

const balance = (id: number) => (db.prepare(BALANCE_SQL).get(id) as { balance: number }).balance;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));
  }
});

describe("推荐奖励", () => {
  it("被推荐人每付一笔，推荐人都拿 10%", () => {
    const a = customer("a@x.com");
    const b = customer("b@x.com", a);
    pay(b, 3000);
    pay(b, 1990);
    expect(balance(a)).toBe(300 + 199);
    expect(balance(b)).toBe(0);
  });

  it("没有推荐人的付款不发奖励", () => {
    const c = customer("c@x.com");
    pay(c, 3000);
    expect(db.prepare("SELECT COUNT(*) AS n FROM balance_entries").get()).toEqual({ n: 0 });
  });

  it("不足 1 分的舍掉，算出来是 0 就不记", () => {
    const a = customer("a@x.com");
    const b = customer("b@x.com", a);
    pay(b, 9);
    pay(b, 15);
    expect(balance(a)).toBe(1);
    expect(db.prepare("SELECT COUNT(*) AS n FROM balance_entries").get()).toEqual({ n: 1 });
  });

  it("未付款的单变成已付款时才发，而且只发一次", () => {
    const a = customer("a@x.com");
    const b = customer("b@x.com", a);
    const o = pay(b, 5000, "pending");
    expect(balance(a)).toBe(0);
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(o);
    db.prepare("UPDATE orders SET status = 'pending' WHERE id = ?").run(o);
    db.prepare("UPDATE orders SET status = 'paid' WHERE id = ?").run(o);
    expect(balance(a)).toBe(500);
  });

  it("余额是流水的总和，花掉的是负数", () => {
    const a = customer("a@x.com");
    const b = customer("b@x.com", a);
    pay(b, 3000);
    db.prepare("INSERT INTO balance_entries (customer_id, amount, kind, created_at) VALUES (?, -100, 'withdrawal', 1)").run(a);
    expect(balance(a)).toBe(200);
  });

  it("明细列出朋友、付款金额和奖励，最新的在前", () => {
    const a = customer("a@x.com");
    const b = customer("b@x.com", a);
    const c = customer("c@x.com", a);
    pay(b, 3000);
    pay(c, 1000);
    expect(db.prepare(REFERRAL_REWARDS_SQL).all(a)).toEqual([
      { friend_id: c, email: "c@x.com", wechat: null, paid: 1000, reward: 100, created_at: 100 },
      { friend_id: b, email: "b@x.com", wechat: null, paid: 3000, reward: 300, created_at: 100 },
    ]);
  });
});

describe("转账单抵扣的余额付款时才扣", () => {
  const avail = (id: number) => db.prepare(AVAILABLE_SQL).get(id) as { balance: number; reserved: number };
  function order(customerId: number, used: number): number {
    const r = db
      .prepare("INSERT INTO orders (customer_id, amount, balance_used, method, status, created_at) VALUES (?, 3500, ?, 'transfer', 'pending', 100) RETURNING id")
      .get(customerId, used) as { id: number };
    return r.id;
  }
  const setStatus = (id: number, status: string) => db.prepare("UPDATE orders SET status = ?, paid_at = 200 WHERE id = ?").run(status, id);
  function give(customerId: number, amount: number) {
    db.prepare("INSERT INTO balance_entries (customer_id, amount, kind, created_at) VALUES (?, ?, 'adjust', 1)").run(customerId, amount);
  }

  it("下单后余额不变，只是被占着；付款后才扣", () => {
    const a = customer("a@x.com");
    give(a, 450);
    const o = order(a, 450);
    expect(avail(a)).toEqual({ balance: 450, reserved: 450 });
    setStatus(o, "processing");
    expect(avail(a)).toEqual({ balance: 450, reserved: 450 });
    setStatus(o, "paid");
    expect(avail(a)).toEqual({ balance: 0, reserved: 0 });
  });

  it("取消的单不扣、也不再占着", () => {
    const a = customer("a@x.com");
    give(a, 450);
    const o = order(a, 450);
    setStatus(o, "cancelled");
    expect(avail(a)).toEqual({ balance: 450, reserved: 0 });
  });

  it("同一张单不会扣两次；没抵扣的单不扣", () => {
    const a = customer("a@x.com");
    give(a, 1000);
    const o = order(a, 300);
    setStatus(o, "paid");
    setStatus(o, "revoked");
    setStatus(o, "paid");
    expect(balance(a)).toBe(700);
    const plain = order(a, 0);
    setStatus(plain, "paid");
    expect(balance(a)).toBe(700);
  });
});
