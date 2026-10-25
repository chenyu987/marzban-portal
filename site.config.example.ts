// 站点配置模板。复制成 site.config.ts 再按自己的情况改（site.config.ts 就是实际生效的那份）。
// 品牌名、下载地址、限制说明这类每家不一样的东西都放在这里，代码里不写死。

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
};
