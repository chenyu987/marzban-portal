-- 提现申请：客人在订阅页申请，填支付宝账号和实名；管理员用 npm run withdrawals 查看，支付宝转账后标成已打款。
-- 申请时就扣余额（balance_entries 记一条 kind = 'withdrawal' 的负数，withdrawal_id 指向这里），同一笔钱不会既提现又买套餐；
-- 管理员拒绝时删掉那条扣款，余额回来。
-- status：pending（等管理员打款）→ paid（已打款）/ rejected（管理员拒绝）/ cancelled（客人自己取消）；后两种余额都退回。每个客人同时最多一笔 pending
CREATE TABLE withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  alipay_account TEXT NOT NULL,
  alipay_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  processed_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX withdrawals_customer ON withdrawals(customer_id, id);
CREATE UNIQUE INDEX withdrawals_one_pending ON withdrawals(customer_id) WHERE status = 'pending';

ALTER TABLE balance_entries ADD COLUMN withdrawal_id INTEGER REFERENCES withdrawals(id);
