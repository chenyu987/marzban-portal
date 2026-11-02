-- 先开通后对账：客人付完款点「我已付款」就马上在 Marzban 开通，管理员之后再去支付宝/微信账单里对账。
-- 对上了点「确认到账」（verified_at）；对不上点「没收到钱」，订阅收回、单记成 revoked。

-- 客人点「我已付款」时选的付款方式（site.payments 里的 name，比如 支付宝、微信）和填的付款人（昵称或名字，选填），对账时用
ALTER TABLE orders ADD COLUMN pay_method TEXT;
ALTER TABLE orders ADD COLUMN payer TEXT;
-- 管理员对账确认收到钱的时间。转账单 status = 'paid' 但这里是空的，就是「已开通、还没对账」
ALTER TABLE orders ADD COLUMN verified_at INTEGER;
-- 这张单是不是新开的订阅（1）还是续期（0）。收回时新开的停用，续期的把加上的天数扣回去
ALTER TABLE orders ADD COLUMN new_sub INTEGER;

-- 以前的转账单都是管理员核对过钱才开通的，算已对账
UPDATE orders SET verified_at = paid_at WHERE method = 'transfer' AND status = 'paid';
