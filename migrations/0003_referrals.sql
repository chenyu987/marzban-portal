-- 推荐记录页按推荐人查被推荐的人
CREATE INDEX customers_referred_by ON customers(referred_by);
