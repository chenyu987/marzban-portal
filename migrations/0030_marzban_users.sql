-- 精简：subscription_plans（订阅现在是什么套餐）和 marzban_wechat（老订阅记着的微信号）都是「每个 Marzban 用户一行」，
-- 合成一张 marzban_users，少一张表。两样都可以没有（没记套餐、没记微信号的就是 NULL）。
-- updated_at 是套餐最后一次改的时间（订阅页圆环从这一刻开始倒数），只记了微信号的行是 NULL
CREATE TABLE marzban_users (
  marzban_username TEXT PRIMARY KEY,
  plan_id TEXT,
  updated_at INTEGER,
  wechat TEXT
);
CREATE INDEX marzban_users_wechat ON marzban_users(wechat);

INSERT INTO marzban_users (marzban_username, plan_id, updated_at)
SELECT marzban_username, plan_id, updated_at FROM subscription_plans;
INSERT INTO marzban_users (marzban_username, wechat)
SELECT marzban_username, wechat FROM marzban_wechat WHERE true
ON CONFLICT (marzban_username) DO UPDATE SET wechat = excluded.wechat;

-- 付款时自动记套餐的两个触发器，改成写新表（逻辑不变，见 0018）
DROP TRIGGER IF EXISTS orders_plan_insert;
DROP TRIGGER IF EXISTS orders_plan_update;
CREATE TRIGGER orders_plan_insert AFTER INSERT ON orders
WHEN NEW.status = 'paid' AND NEW.plan_id IS NOT NULL AND NEW.marzban_username IS NOT NULL
BEGIN
  INSERT INTO marzban_users (marzban_username, plan_id, updated_at)
  VALUES (NEW.marzban_username, NEW.plan_id, COALESCE(NEW.paid_at, NEW.created_at))
  ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at;
END;
CREATE TRIGGER orders_plan_update AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.plan_id IS NOT NULL AND NEW.marzban_username IS NOT NULL
BEGIN
  INSERT INTO marzban_users (marzban_username, plan_id, updated_at)
  VALUES (NEW.marzban_username, NEW.plan_id, COALESCE(NEW.paid_at, NEW.created_at))
  ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at;
END;

DROP TABLE subscription_plans;
DROP TABLE marzban_wechat;
