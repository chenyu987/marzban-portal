-- 老客人（在 portal 上线前就在 Marzban 上开好的用户）的微信号。Marzban 用户名一般就是客人的微信名，
-- 微信号单独记在这里，管理后台搜微信号能找到对应的 Marzban 用户。
-- 数据由管理员直接写进线上库，不放进迁移文件（迁移会同步到公开仓库）
CREATE TABLE marzban_wechat (
  marzban_username TEXT PRIMARY KEY,
  wechat TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX marzban_wechat_wechat ON marzban_wechat(wechat);
