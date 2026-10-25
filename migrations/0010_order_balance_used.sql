-- 下单时用余额抵扣了多少（分）。客人还要转账的金额 = amount - balance_used。
-- 抵扣的余额在下单时就扣了（balance_entries 里一条 kind = 'purchase'、order_id 指向这张单的负数），单子取消时删掉那条扣款、余额退回。
-- amount 还是套餐价，推荐奖励照旧按 amount 算。
-- 余额只用来抵扣套餐费用（2026-10-26 定）。0009 建的 withdrawals 表和 balance_entries.withdrawal_id 不再使用，留着不删
ALTER TABLE orders ADD COLUMN balance_used INTEGER NOT NULL DEFAULT 0;
