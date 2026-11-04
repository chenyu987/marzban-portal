-- 兑换码可以单独定天数：后台生成时在套餐默认天数上加减（比如 7 天体验改成 10 天）。
-- 空表示按套餐的天数。编号跳过 0026，留给还没合并的 iplimit 分支
ALTER TABLE redeem_codes ADD COLUMN days INTEGER;
