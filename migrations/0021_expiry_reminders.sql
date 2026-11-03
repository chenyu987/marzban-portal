-- 到期提醒邮件
-- customers.lang：客人最后选的语言（zh / en），提醒邮件按它写；空 = 中文
-- expiry_notices：已经发过的提醒。按（订阅、到期时间、提前几天）记，同一封不会发两次；续费后到期时间变了，下一期重新提醒
ALTER TABLE customers ADD COLUMN lang TEXT;

CREATE TABLE expiry_notices (
  marzban_username TEXT NOT NULL,
  expire INTEGER NOT NULL,
  days INTEGER NOT NULL,
  sent_at INTEGER NOT NULL,
  PRIMARY KEY (marzban_username, expire, days)
);
