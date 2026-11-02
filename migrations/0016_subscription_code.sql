-- 订阅编号：给客人看、报给客服的随机编号（8 位十六进制，显示成 7F3A-9C21），看不出是第几单。
-- 以前直接显示 Marzban 用户名 c5_1，等于告诉客人「你是第 5 个客人」
ALTER TABLE subscriptions ADD COLUMN code TEXT;
UPDATE subscriptions SET code = upper(hex(randomblob(4))) WHERE code IS NULL;
CREATE UNIQUE INDEX subscriptions_code ON subscriptions(code);

-- 新绑的订阅自动生成编号，插入 subscriptions 的地方都不用改
CREATE TRIGGER subscriptions_code_default AFTER INSERT ON subscriptions
WHEN NEW.code IS NULL
BEGIN
  UPDATE subscriptions SET code = upper(hex(randomblob(4))) WHERE id = NEW.id;
END;
