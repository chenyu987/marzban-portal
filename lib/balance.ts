// 余额和推荐奖励明细的查询。奖励本身由 migrations/0004_balance.sql 里的触发器在订单付款时自动发

export const BALANCE_SQL = "SELECT COALESCE(SUM(amount), 0) AS balance FROM balance_entries WHERE customer_id = ?";

// 下面几段 SQL 里 ?1 都是客人 id。
// 余额流水的合计（和 BALANCE_SQL 一样，写成子查询拼进别的语句）
export const LEDGER_SQL = "(SELECT COALESCE(SUM(amount), 0) FROM balance_entries WHERE customer_id = ?1)";
// 抵扣在还没付款的转账单上的余额：下单时只记在单上（orders.balance_used），付款时才扣（migrations/0022 的触发器），
// 这部分不能再拿去下别的单。已经有扣款流水的单不重复算
export const RESERVED_SQL = `(SELECT COALESCE(SUM(o.balance_used), 0) FROM orders o
  WHERE o.customer_id = ?1 AND o.method = 'transfer' AND o.status IN ('pending', 'processing') AND o.balance_used > 0
    AND NOT EXISTS (SELECT 1 FROM balance_entries b WHERE b.order_id = o.id AND b.kind = 'purchase'))`;
// 余额（流水合计）和其中被没付款的单占着的部分；下单时能用的 = balance - reserved
export const AVAILABLE_SQL = `SELECT ${LEDGER_SQL} AS balance, ${RESERVED_SQL} AS reserved`;

// 推荐人看到的明细：哪位朋友（打码前的邮箱，显示时再打码）、哪天付款、付了多少、自己拿了多少
export const REFERRAL_REWARDS_SQL = `
  SELECT o.customer_id AS friend_id, c.email, c.wechat, o.amount AS paid, b.amount AS reward, b.created_at
  FROM balance_entries b
  JOIN orders o ON o.id = b.order_id
  JOIN customers c ON c.id = o.customer_id
  WHERE b.customer_id = ? AND b.kind = 'referral_reward'
  ORDER BY b.id DESC
  LIMIT 100`;

export type RewardRow = { friend_id: number; email: string; wechat: string | null; paid: number; reward: number; created_at: number };
