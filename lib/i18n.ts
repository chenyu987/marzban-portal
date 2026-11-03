// 中英文切换。客人在页面底部点「中文 / English」，选的语言记在 cookie lang 里，没选过就是中文。
// 纯函数，前后端都能用；服务器上读 cookie 用 lib/lang.ts，客户端组件用 app/LangContext.tsx 的 useT()。
// 文案直接写在用到的地方：t("中文", "English")，不用另外维护词典。管理后台只有中文
import type { Text } from "../site.config.example";

export type Lang = "zh" | "en";
export type T = (zh: string, en: string) => string;

export const LANG_COOKIE = "lang";

export const parseLang = (v: string | null | undefined): Lang => (v === "en" ? "en" : "zh");

export const makeT =
  (lang: Lang): T =>
  (zh, en) =>
    lang === "en" ? en : zh;

// site.config 里的文案可以只写中文，也可以写 { zh, en }
export function pick(text: Text, lang: Lang): string {
  return typeof text === "string" ? text : text[lang];
}

// <html lang>、日期格式用
export const LOCALE: Record<Lang, string> = { zh: "zh-CN", en: "en-US" };
