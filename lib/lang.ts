// 只在服务器上用：从 cookie 读客人选的语言
import { cookies } from "next/headers";
import type { Text } from "../site.config.example";
import { LANG_COOKIE, makeT, parseLang, pick, type Lang } from "./i18n";

export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

// const { t, p, lang } = await getT()：t("中文", "English") 选文案，p(site.xxx) 取配置里对应语言的那句
export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang), p: (text: Text) => pick(text, lang) };
}
