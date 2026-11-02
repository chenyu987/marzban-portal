-- 订单号：给客人看、转账备注里填的号。以前直接用自增 id（1、2、3……），一看就知道一共才几单。
-- 改成「下单日期（北京时间 YYMMDD；D1 的 SQLite 不认 %y，用 %Y 再去掉前两位）+ 5 位数」，比如 26110348213，显示成 261103-48213。
-- 5 位数由 id 换算：(id × 7919 + 4271) mod 100000。7919 和 100000 互质，id 在 10 万以内不会撞号，
-- 相邻两单也不是挨着的数。全是数字，客人在支付宝、微信转账备注里好填。内部仍然用 id（链接、表单、外键都不变）
ALTER TABLE orders ADD COLUMN no TEXT;
UPDATE orders SET no = substr(strftime('%Y%m%d', created_at + 28800, 'unixepoch'), 3) || printf('%05d', (id * 7919 + 4271) % 100000) WHERE no IS NULL;
CREATE UNIQUE INDEX orders_no ON orders(no);

-- 新下的单自动生成，插入订单的地方都不用改
CREATE TRIGGER orders_no_default AFTER INSERT ON orders
WHEN NEW.no IS NULL
BEGIN
  UPDATE orders SET no = substr(strftime('%Y%m%d', NEW.created_at + 28800, 'unixepoch'), 3) || printf('%05d', (NEW.id * 7919 + 4271) % 100000) WHERE id = NEW.id;
END;
