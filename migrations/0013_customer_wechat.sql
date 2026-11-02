-- 注册时必填微信号，方便客服联系客人。以前注册的客人没有，所以允许为空
ALTER TABLE customers ADD COLUMN wechat TEXT;
