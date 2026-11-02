// 余额和推荐奖励明细的查询。奖励本身由 migrations/0004_balance.sql 里的触发器在订单付款时自动发

export const BALANCE_SQL = "SELECT COALESCE(SUM(amount), 0) AS balance FROM balance_entries WHERE customer_id = ?";

// 推荐人看到的明细：哪位朋友（打码前的邮箱，显示时再打码）、哪天付款、付了多少、自己拿了多少
export const REFERRAL_REWARDS_SQL = `
  SELECT c.email, c.wechat, o.amount AS paid, b.amount AS reward, b.created_at
  FROM balance_entries b
  JOIN orders o ON o.id = b.order_id
  JOIN customers c ON c.id = o.customer_id
  WHERE b.customer_id = ? AND b.kind = 'referral_reward'
  ORDER BY b.id DESC
  LIMIT 100`;

export type RewardRow = { email: string; wechat: string | null; paid: number; reward: number; created_at: number };
