-- 付款记录。金额一律用「分」存整数，避免小数误差。
-- 现在只有已付款的单（status = 'paid'）；以后接在线支付再用 pending 之类的状态
CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  -- 怎么付的：manual（管理员手动记账）、redeem_code、balance
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'paid',
  note TEXT,
  paid_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX orders_customer ON orders(customer_id);

-- 余额流水：正数入账，负数花掉。客人余额 = 这张表按 customer_id 求和，不另存一个数，方便对账。
-- kind：referral_reward（推荐奖励）、purchase（用余额买套餐）、withdrawal（提现）、adjust（管理员调整）
CREATE TABLE balance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount INTEGER NOT NULL,
  kind TEXT NOT NULL,
  order_id INTEGER REFERENCES orders(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX balance_entries_customer ON balance_entries(customer_id, id);
-- 一笔付款最多给一次推荐奖励
CREATE UNIQUE INDEX balance_entries_referral_once ON balance_entries(order_id) WHERE kind = 'referral_reward';

-- 推荐奖励：被推荐人每付一笔款，推荐人拿这笔金额的 10%（不足 1 分的舍掉）。
-- 写成触发器，不管是网页、兑换码还是管理员在命令行记的账，只要订单变成已付款就自动发，不会漏
CREATE TRIGGER orders_referral_reward_insert AFTER INSERT ON orders
WHEN NEW.status = 'paid'
BEGIN
  INSERT OR IGNORE INTO balance_entries (customer_id, amount, kind, order_id, created_at)
  SELECT referred_by, NEW.amount * 10 / 100, 'referral_reward', NEW.id, COALESCE(NEW.paid_at, NEW.created_at)
  FROM customers
  WHERE id = NEW.customer_id AND referred_by IS NOT NULL AND NEW.amount * 10 / 100 > 0;
END;

CREATE TRIGGER orders_referral_reward_update AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid'
BEGIN
  INSERT OR IGNORE INTO balance_entries (customer_id, amount, kind, order_id, created_at)
  SELECT referred_by, NEW.amount * 10 / 100, 'referral_reward', NEW.id, COALESCE(NEW.paid_at, NEW.created_at)
  FROM customers
  WHERE id = NEW.customer_id AND referred_by IS NOT NULL AND NEW.amount * 10 / 100 > 0;
END;
