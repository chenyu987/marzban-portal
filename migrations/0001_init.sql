-- 客人账号
CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  -- 推荐码（M2 用）：注册时就生成好，免得以后再补
  referral_code TEXT NOT NULL UNIQUE,
  referred_by INTEGER REFERENCES customers(id),
  created_at INTEGER NOT NULL
);

-- 登录会话：cookie 里放随机 token，这里只存它的 SHA-256
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX sessions_customer ON sessions(customer_id);

-- 客人名下的订阅：一个账号可以有多个 Marzban 用户。到期、流量以 Marzban 为准，这里不存
CREATE TABLE subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  marzban_username TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE INDEX subscriptions_customer ON subscriptions(customer_id);
