// 站点配置模板。复制成 site.config.ts 再按自己的情况改（site.config.ts 就是实际生效的那份）。
// 品牌名、下载地址、限制说明这类每家不一样的东西都放在这里，代码里不写死。

// 一个套餐。管理员记账时用 --plan <id> 指定，脚本按这里的设置在 Marzban 开通或续期
export type Plan = {
  id: string; // 命令行里用的名字，比如 month
  name: string; // 显示给人看的名字
  group?: string; // 套餐页按这个分组显示，比如同一档位的月付、季付放一起
  price: number; // 价格，单位「分」
  days: number; // 有效天数；续费时从原到期时间往后加（已过期就从现在算）
  dataGB: number | null; // 流量上限，null 表示不限
  // 流量多久清零一次：不写就是整个有效期一共 dataGB；month 表示每月 dataGB（Marzban 每 30 天自动清零）
  dataReset?: "month";
  ip: number; // 同时在用的 IP 数，写进 Marzban 备注 ip=N；0 表示不限
};

export type SiteConfig = {
  // 显示在页面左上角、浏览器标签页、客户端里订阅名字的品牌名
  brand: string;
  description: string;
  // 安装教程里的下载地址
  downloads: {
    clashVerge: string;
    hiddify: string;
    // Windows 的 Hiddify 想固定某个版本时单独填，不用就和 hiddify 一样
    hiddifyWindows: string;
  };
  // 教程页「注意」里关于设备/IP 限制的说明。没有限制就填 null
  deviceLimitNote: string | null;
  // 金额前面的币种符号，比如 ¥、$
  currency: string;
  // 套餐列表。空着表示还没定，记账脚本就不能开通订阅
  plans: Plan[];
  // 套餐页上告诉客人怎么买兑换码，比如「付款后联系客服微信 xxx 领取兑换码」
  purchaseNote: string;
};

export const site: SiteConfig = {
  brand: "Marzban Portal",
  description: "Marzban 用户自助中心",
  downloads: {
    clashVerge: "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest",
    hiddify: "https://github.com/hiddify/hiddify-app/releases/latest",
    hiddifyWindows: "https://github.com/hiddify/hiddify-app/releases/latest",
  },
  deviceLimitNote: null,
  currency: "¥",
  plans: [
    { id: "month", name: "月付", price: 2000, days: 30, dataGB: 100, ip: 3 },
    { id: "quarter", name: "季付", price: 5400, days: 90, dataGB: 100, ip: 3 },
  ],
  purchaseNote: "付款后管理员会把兑换码发给你，在下面输入就能自动开通或续期。",
};
