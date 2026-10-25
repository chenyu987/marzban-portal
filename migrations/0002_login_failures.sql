-- 登录失败记录，用来限制试密码：同一邮箱或同一 IP 短时间内错太多次就暂时不让登录
CREATE TABLE login_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_failures_email ON login_failures(email, at);
CREATE INDEX login_failures_ip ON login_failures(ip, at);
