-- 重置密码的链接：客人在「忘记密码」页面申请（发邮件），或者管理员用 npm run password:reset-link 生成后发给客人。
-- 链接里带随机 token，这里只存它的 SHA-256（和 sessions 一样），数据库泄露也拿不到能用的链接。
-- 用过一次（used_at 有值）或者过期了就作废
CREATE TABLE password_resets (
  token_hash TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX password_resets_customer ON password_resets(customer_id, created_at);
