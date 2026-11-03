// 只在服务器上用：客人选过语言就用 cookie 里的；没选过默认中文，site.config 开了 autoLang 就按浏览器语言
import { cookies, headers } from "next/headers";
import { site } from "@/site.config";
import type { Text } from "../site.config.example";
import { LANG_COOKIE, langFromAcceptLanguage, makeT, parseLang, pick, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  const chosen = (await cookies()).get(LANG_COOKIE)?.value;
  if (chosen) return parseLang(chosen);
  if (!site.autoLang) return "zh";
  return langFromAcceptLanguage((await headers()).get("accept-language"));
}

// const { t, p, lang } = await getT()：t("中文", "English") 选文案，p(site.xxx) 取配置里对应语言的那句
export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang), p: (text: Text) => pick(text, lang) };
}
