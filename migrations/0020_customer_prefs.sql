-- 客人在「账户」页自己改的偏好
-- pref_client：常用客户端（shadowrocket / clash / hiddify），订阅页上它的导入按钮排最前；空 = 按默认顺序
-- notify_expiry：要不要收到期提醒邮件（1 要，0 不要），邮件开通后按它发
ALTER TABLE customers ADD COLUMN pref_client TEXT;
ALTER TABLE customers ADD COLUMN notify_expiry INTEGER NOT NULL DEFAULT 1;
