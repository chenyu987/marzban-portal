-- 余额流水加备注：管理员在后台加减余额（kind = 'adjust'）时必须写原因，比如「补偿 10 月断线」「冲掉记错的一笔」
ALTER TABLE balance_entries ADD COLUMN note TEXT;
