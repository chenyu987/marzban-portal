-- 订单记下买的是哪个套餐、开通或续期的是哪个 Marzban 用户。只记账不开通的单两项都是空
ALTER TABLE orders ADD COLUMN plan_id TEXT;
ALTER TABLE orders ADD COLUMN marzban_username TEXT;
