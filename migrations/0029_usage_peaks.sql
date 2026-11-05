-- 每个月用量最多的那个订阅用了多少（字节）。客人订阅页上「不限流量」的圆环按「本月已用 ÷ 上个月最高」画。
-- 每天的定时任务（和到期提醒一起）发现上个月还没算就算一次，见 lib/usage-peak.ts。month 是北京时间的「2026-10」
CREATE TABLE usage_peaks (
  month TEXT PRIMARY KEY,
  peak INTEGER NOT NULL,
  username TEXT,
  computed_at INTEGER NOT NULL
);
