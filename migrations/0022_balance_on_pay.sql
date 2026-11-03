-- 转账单用余额抵扣的部分，改成付款时才扣（2026-11-03）。
-- 以前下单时就记一条 purchase 扣款，客人下了单没付，余额就先没了，看着像被花掉了。
-- 现在下单时只记在 orders.balance_used 上；单子变成已付款（客人点「我已付款」开通、管理员确认、命令行确认）时由这个触发器扣。
-- 还没付款的单占着的余额不能再拿去下别的单（lib/balance.ts 的 RESERVED_SQL）。
-- NOT EXISTS：同一张单不会扣两次（这之前下的、还没付款的单下单时已经扣过，付款时不会再扣；取消时照旧退回）
CREATE TRIGGER orders_balance_on_pay AFTER UPDATE OF status ON orders
WHEN NEW.status = 'paid' AND OLD.status <> 'paid' AND NEW.method = 'transfer' AND NEW.balance_used > 0
BEGIN
  INSERT INTO balance_entries (customer_id, amount, kind, order_id, created_at)
  SELECT NEW.customer_id, -NEW.balance_used, 'purchase', NEW.id, COALESCE(NEW.paid_at, unixepoch())
  WHERE NOT EXISTS (SELECT 1 FROM balance_entries WHERE order_id = NEW.id AND kind = 'purchase');
END;

