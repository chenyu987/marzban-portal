-- 升级套餐的单：kind = 'upgrade'，到期时间不变，只把订阅换成 plan_id 那一档（补剩余天数的差价）。
-- from_plan_id 是升级前的套餐，对账没收到钱、收回时换回去。普通的新开 / 续期单 kind 是 NULL
ALTER TABLE orders ADD COLUMN kind TEXT;
ALTER TABLE orders ADD COLUMN from_plan_id TEXT;

-- 付款时记套餐的触发器：升级单只换套餐，不动 updated_at（订阅页剩余天数圆环还是从上次续费开始倒数）
DROP TRIGGER IF EXISTS orders_plan_insert;
DROP TRIGGER IF EXISTS orders_plan_update;
CREATE TRIGGER orders_plan_insert AFTER INSERT ON orders
WHEN NEW.status = 'paid' AND NEW.plan_id IS NOT NULL AND NEW.marzban_username IS NOT NULL
BEGIN
  INSERT INTO marzban_users (marzban_username, plan_id, updated_at)
  VALUES (NEW.marzban_username, NEW.plan_id, COALESCE(NEW.paid_at, NEW.created_at))
  ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id,
    updated_at = CASE WHEN NEW.kind = 'upgrade' THEN COALESCE(marzban_users.updated_at, excluded.updated_at) ELSE excluded.updated_at END;
END;
CREATE TRIGGER orders_plan_update AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.plan_id IS NOT NULL AND NEW.marzban_username IS NOT NULL
BEGIN
  INSERT INTO marzban_users (marzban_username, plan_id, updated_at)
  VALUES (NEW.marzban_username, NEW.plan_id, COALESCE(NEW.paid_at, NEW.created_at))
  ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id,
    updated_at = CASE WHEN NEW.kind = 'upgrade' THEN COALESCE(marzban_users.updated_at, excluded.updated_at) ELSE excluded.updated_at END;
END;
