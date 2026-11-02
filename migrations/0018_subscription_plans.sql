-- 每个订阅现在是什么套餐。以前是每次现查「最近一张已付款订单」，管理员没法直接改；
-- 现在单独记一张表：付款时自动写（触发器），管理员在后台改套餐也写这里，客人订阅页的标题跟着变。
-- 用 Marzban 用户名做主键：没绑客人的老订阅也能有套餐
CREATE TABLE subscription_plans (
  marzban_username TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 补上以前的：每个订阅取最近一张已付款订单的套餐（SQLite 里 MAX() 旁边的列取的就是最大那一行的值）
INSERT INTO subscription_plans (marzban_username, plan_id, updated_at)
SELECT marzban_username, plan_id, MAX(COALESCE(paid_at, created_at))
FROM orders
WHERE status = 'paid' AND plan_id IS NOT NULL AND marzban_username IS NOT NULL
GROUP BY marzban_username;

-- 以后订单一变成已付款就更新（兑换码是直接插入已付款的单，转账和余额是从待付款改成已付款）
CREATE TRIGGER orders_plan_insert AFTER INSERT ON orders
WHEN NEW.status = 'paid' AND NEW.plan_id IS NOT NULL AND NEW.marzban_username IS NOT NULL
BEGIN
  INSERT INTO subscription_plans (marzban_username, plan_id, updated_at)
  VALUES (NEW.marzban_username, NEW.plan_id, COALESCE(NEW.paid_at, NEW.created_at))
  ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at;
END;

CREATE TRIGGER orders_plan_update AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.plan_id IS NOT NULL AND NEW.marzban_username IS NOT NULL
BEGIN
  INSERT INTO subscription_plans (marzban_username, plan_id, updated_at)
  VALUES (NEW.marzban_username, NEW.plan_id, COALESCE(NEW.paid_at, NEW.created_at))
  ON CONFLICT (marzban_username) DO UPDATE SET plan_id = excluded.plan_id, updated_at = excluded.updated_at;
END;
