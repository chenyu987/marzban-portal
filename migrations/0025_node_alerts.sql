-- 2026-11-04 节点掉线提醒（lib/admin-alerts.ts，每 5 分钟查一次）。
-- 一个节点一行，只记现在掉着的：第一次看到掉线记 down_since，连着掉 5 分钟以上才发邮件（记 alerted_at），免得闪断也发；
-- 恢复了发一封「已恢复」再删掉这一行。node_id = 0 表示面板本身连不上
CREATE TABLE node_alerts (
  node_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT,
  down_since INTEGER NOT NULL,
  alerted_at INTEGER
);
