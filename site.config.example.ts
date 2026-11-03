// 站点配置模板。复制成 site.config.ts 再按自己的情况改（site.config.ts 就是实际生效的那份）。
// 品牌名、下载地址、限制说明这类每家不一样的东西都放在这里，代码里不写死。

// 显示给客人看的文案：只写中文，或者中英文都写 { zh: "…", en: "…" }（客人在页面底部切到 English 时用 en）
export type Text = string | { zh: string; en: string };

// 一个套餐。管理员记账时用 --plan <id> 指定，脚本按这里的设置在 Marzban 开通或续期
export type Plan = {
  id: string; // 命令行里用的名字，比如 month
  name: string; // 显示给人看的名字
  en?: string; // 英文名，客人切到 English 时显示，不写就显示 name
  group?: string; // 套餐页按这个分组显示，比如同一档位的月付、季付放一起
  price: number; // 价格，单位「分」
  days: number; // 有效天数；续费时从原到期时间往后加（已过期就从现在算）
  dataGB: number | null; // 流量上限，null 表示不限
  // 流量多久清零一次：不写就是整个有效期一共 dataGB；month 表示每月 dataGB（Marzban 每 30 天自动清零）
  dataReset?: "month";
  ip: number; // 同时在用的 IP 数，写进 Marzban 备注 ip=N；0 表示不限
  // true：只能用兑换码开（比如免费体验），不在价目表和首页价格卡上，客人不能自己下单
  codeOnly?: boolean;
};

export type SiteConfig = {
  // 显示在页面左上角、浏览器标签页的品牌名
  brand: string;
  // 一键导入后客户端里这条订阅叫什么（比如写网址，客人一看就知道去哪续费）。不填用 brand
  importName?: string;
  // portal 的网址，重置密码的链接用它来拼（不用请求里的 Host，防止被伪造）。换域名时记得改
  siteUrl: string;
  description: Text;
  // 安装教程里的下载地址
  downloads: {
    clashVerge: string;
    hiddify: string;
    // Windows 的 Hiddify 想固定某个版本时单独填，不用就和 hiddify 一样
    hiddifyWindows: string;
  };
  // 品牌图标，文件放在 public/site/ 下（不同步到公开仓库）：svg 用在导航和登录页，其他是浏览器标签、手机主屏幕图标。
  // 不填就只显示品牌名文字
  logo?: { svg: string; appleTouch?: string; icon192?: string; icon512?: string; maskable512?: string };
  // 品牌主色（手机浏览器顶栏、主屏幕启动画面用），比如 #2F6BFF
  themeColor?: string;
  // false：landing 不公开。首页只有品牌名和登录、注册按钮，登录页左边只有品牌名和介绍；
  // landing 里的常见问题照样显示在登录后的「安装教程」底部。不填等于 true
  landingPublic?: boolean;
  // true：不让搜索引擎收录（页面加 noindex，robots.txt 禁止抓取）。客人靠推荐链接来、不靠搜索时打开
  noindex?: boolean;
  // 首页（/）的内容。不填（或 landingPublic: false）时首页只有品牌名和登录、注册按钮。
  // highlights：卖点卡片；steps：几步用上；faq：常见问题。不列节点在哪，免得被人按地址封
  landing?: {
    headline: Text;
    sub: Text;
    highlights?: { icon: string; title: Text; desc: Text }[];
    steps?: { title: Text; desc: Text }[];
    faq?: { q: Text; a: Text }[];
  };
  // 教程截图放在 public/site/tutorial/ 下（不同步到公开仓库）。true 才在教程里显示截图
  tutorialShots?: boolean;
  // 每个页面底部「联系我们」的邮箱，不填就不显示
  contactEmail?: string;
  // 客服微信号：页面底部和「请联系客服」的提示旁边放一个「复制客服微信」按钮，不填就只显示邮箱
  supportWechat?: string;
  // 金额前面的币种符号，比如 ¥、$
  currency: string;
  // 套餐列表。空着表示还没定，记账脚本就不能开通订阅
  plans: Plan[];
  // 套餐页价目表上每一档怎么显示，按 Plan.group 对应，没写的档位只显示档位名和流量。
  // name：档位叫什么（订阅页、首页价格卡上显示），不写就用 Plan.group；title：价目表第一列的名字；lines：第二列的说明，每条一行；accent：说明第一行标红；
  // highlight：hot 名字格标红底、写上 hot，top 名字上加 👑、整行标红加粗；
  // tags：价格上面的小标签，按套餐 id 写，比如 { "p3-quarter": "（买的最多）" }
  planGroups?: Record<
    string,
    { name?: Text; title: Text; lines?: Text[]; accent?: boolean; highlight?: "hot" | "top"; tags?: Record<string, Text> }
  >;
  // 价目表下面的说明，每条一行
  planNotes?: Text[];
  // 套餐页上告诉客人怎么买兑换码，比如「付款后联系客服微信 xxx 领取兑换码」
  purchaseNote: Text;
  // 客人在套餐页下单后看到的收款方式。客人转账时备注订单号，管理员看到钱到了用 npm run orders -- confirm 确认。
  // qr 填收款码里的内容（用手机扫一下自己的收款码就能看到，比如支付宝是 https://qr.alipay.com/...），页面在浏览器里生成二维码。
  // 空数组表示不开放下单，套餐页只能用兑换码
  payments: { name: Text; qr: string }[];
  // 管理后台（/admin）。前面要挡一层 Cloudflare Access：accessTeamDomain 是团队域名（xxx.cloudflareaccess.com），
  // accessAud 是 Access 里后台那个应用的 AUD。两个都填了后台才开放，没填时 /admin 一律 404。
  // emails：能进后台的邮箱，Access 也要放行同样的邮箱；管理员账号（npm run admin:create）的邮箱要和 Access 登录的一样
  admin: { accessTeamDomain: string | null; accessAud: string | null; emails: string[] };
};

export const site: SiteConfig = {
  brand: "Marzban Portal",
  siteUrl: "https://portal.example.com",
  description: { zh: "Marzban 用户自助中心", en: "Marzban self-service portal" },
  downloads: {
    clashVerge: "https://github.com/clash-verge-rev/clash-verge-rev/releases/latest",
    hiddify: "https://github.com/hiddify/hiddify-app/releases/latest",
    hiddifyWindows: "https://github.com/hiddify/hiddify-app/releases/latest",
  },
  currency: "¥",
  plans: [
    { id: "month", name: "月付", en: "Monthly", price: 2000, days: 30, dataGB: 100, ip: 3 },
    { id: "quarter", name: "季付", en: "Quarterly", price: 5400, days: 90, dataGB: 100, ip: 3 },
  ],
  purchaseNote: {
    zh: "付款后管理员会把兑换码发给你，在下面输入就能自动开通或续期。",
    en: "After you pay, the admin will send you a redeem code. Enter it below to activate or extend your subscription.",
  },
  payments: [],
  admin: { accessTeamDomain: null, accessAud: null, emails: [] },
};
