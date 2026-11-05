-- 推荐奖励改成管理员「确认到账」之后才发。
-- 以前转账单在客人点「我已付款」时就变成 paid（先开通后对账，见 0014），触发器当场给推荐人记 10%；
-- 现在转账单要等 verified_at 有值（管理员对上了账）才发，「没收到钱」收回的单永远不发。
-- 别的付款方式（兑换码、余额、管理员手动记账）钱已经确定了，照旧付款时就发。

DROP TRIGGER IF EXISTS orders_referral_reward_insert;
DROP TRIGGER IF EXISTS orders_referral_reward_update;

-- 插入时就是已付款的（管理员手动记账、兑换码）：不是转账单，或者转账单已经对过账
CREATE TRIGGER orders_referral_reward_insert AFTER INSERT ON orders
WHEN NEW.status = 'paid' AND (NEW.method <> 'transfer' OR NEW.verified_at IS NOT NULL)
BEGIN
  INSERT OR IGNORE INTO balance_entries (customer_id, amount, kind, order_id, created_at)
  SELECT referred_by, NEW.amount * 10 / 100, 'referral_reward', NEW.id, COALESCE(NEW.verified_at, NEW.paid_at, NEW.created_at)
  FROM customers
  WHERE id = NEW.customer_id AND referred_by IS NOT NULL AND NEW.amount * 10 / 100 > 0;
END;

-- 变成已付款时：不是转账单，或者同一条语句里已经对过账（管理员直接确认收到钱再开通）
CREATE TRIGGER orders_referral_reward_update AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND (NEW.method <> 'transfer' OR NEW.verified_at IS NOT NULL)
BEGIN
  INSERT OR IGNORE INTO balance_entries (customer_id, amount, kind, order_id, created_at)
  SELECT referred_by, NEW.amount * 10 / 100, 'referral_reward', NEW.id, COALESCE(NEW.verified_at, NEW.paid_at, NEW.created_at)
  FROM customers
  WHERE id = NEW.customer_id AND referred_by IS NOT NULL AND NEW.amount * 10 / 100 > 0;
END;

-- 管理员点「确认到账」：这时才给推荐人记。同一笔只记一次（balance_entries_referral_once）
CREATE TRIGGER orders_referral_reward_verify AFTER UPDATE OF verified_at ON orders
WHEN NEW.verified_at IS NOT NULL AND OLD.verified_at IS NULL AND NEW.status = 'paid'
BEGIN
  INSERT OR IGNORE INTO balance_entries (customer_id, amount, kind, order_id, created_at)
  SELECT referred_by, NEW.amount * 10 / 100, 'referral_reward', NEW.id, NEW.verified_at
  FROM customers
  WHERE id = NEW.customer_id AND referred_by IS NOT NULL AND NEW.amount * 10 / 100 > 0;
END;

-- 现在已经开通、还没对账的转账单，之前提前发的推荐奖励先收回，确认到账时再发
DELETE FROM balance_entries
WHERE kind = 'referral_reward'
  AND order_id IN (SELECT id FROM orders WHERE method = 'transfer' AND status = 'paid' AND verified_at IS NULL);
