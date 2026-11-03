-- 2026-11-04
-- 客人主页能隐藏已过期、或者 Marzban 上已经删掉的订阅。只是不在主页显示，subscriptions 这一行和订单、日志都留着。
-- 隐藏后订阅又续上了（比如管理员续期），主页会自动重新显示，并清掉 hidden_at
ALTER TABLE subscriptions ADD COLUMN hidden_at INTEGER;

-- 管理员「我的账户」页
-- admin_sessions：记下是哪台设备、最后什么时候用过，账户页列出来，可以退出别的设备
ALTER TABLE admin_sessions ADD COLUMN user_agent TEXT;
ALTER TABLE admin_sessions ADD COLUMN ip TEXT;
ALTER TABLE admin_sessions ADD COLUMN last_seen_at INTEGER;
-- 后台偏好：订阅列表默认每页多少个、默认排序；时间显示成「3 天后到期」（relative）还是具体日期（absolute）
ALTER TABLE admins ADD COLUMN pref_page_size INTEGER;
ALTER TABLE admins ADD COLUMN pref_sort TEXT;
ALTER TABLE admins ADD COLUMN pref_time TEXT;
