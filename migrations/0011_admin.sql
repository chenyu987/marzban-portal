-- 管理后台（/admin）。安全要求见 docs/portal-plan.md「管理后台」，这里对应其中两条：
--   管理员账号和客人账号分开存，客人账号登录不了后台（admins、admin_sessions）
--   操作日志：谁、什么时候、对谁、做了什么（admin_logs）
-- 管理员用 npm run admin:create 建，网页上不能注册
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- 和客人的 sessions 一样只存 token 的 SHA-256；有效期短（12 小时）
CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- action：做了什么，比如 order.confirm、order.cancel、login；target：对谁（订单号、客人邮箱）；detail：补充说明（JSON 或文字）
CREATE TABLE admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER REFERENCES admins(id),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX admin_logs_created ON admin_logs(created_at);
