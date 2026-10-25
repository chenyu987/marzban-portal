-- 客人在套餐页下单：先建一张待付款的单（pending），客人转账时备注写订单号，管理员看到钱到了再确认。
-- status：pending（等付款）→ processing（管理员确认后正在开 Marzban）→ paid；客人或管理员取消是 cancelled。
-- processing 是为了防止同一张单被确认两次，或者开通到一半被客人取消；开通出错时停在这里，交给管理员核对。
-- 推荐奖励的触发器（0004）在单变成 paid 时自动发，这里不用改。
-- method 多一种：transfer（客人下单后转账，管理员确认收款）。
-- marzban_username：续期单下单时就填要续的用户；新开的单下单时为空，开通后填上新用户名。
CREATE INDEX orders_status ON orders(status, created_at);

-- 客人付完款点「我已付款」的时间。管理员按这个时间和金额去支付宝/微信账单里找这笔钱：
-- 没点过的单就是客人还没付；点了但账单里找不到的就是没付到
ALTER TABLE orders ADD COLUMN claimed_at INTEGER;
