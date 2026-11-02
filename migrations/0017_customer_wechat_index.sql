-- 后台按微信号把老订阅（marzban_wechat）和注册客人（customers）对上：微信号不分大小写比较，加索引
CREATE INDEX customers_wechat ON customers(wechat COLLATE NOCASE);
