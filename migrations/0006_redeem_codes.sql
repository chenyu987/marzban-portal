-- 兑换码：管理员用 npm run codes:create 生成，客人在套餐页输入后自动开通或续期。
-- 用掉时记下谁用的、对应哪张订单；used_by 为空表示还没用
CREATE TABLE redeem_codes (
  code TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  note TEXT,
  used_by INTEGER REFERENCES customers(id),
  used_at INTEGER,
  order_id INTEGER REFERENCES orders(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX redeem_codes_used_by ON redeem_codes(used_by);
