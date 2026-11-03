// 只在服务器上用：从 site.config 里挑出浏览器里要用的几项，经根布局的 SiteProvider 传给客户端组件
import { site } from "@/site.config";
import { pick, type Lang } from "./i18n";

export type PublicSite = { brand: string; importName: string; logoSvg?: string; support: { wechat?: string; email?: string } };

export const publicSite: PublicSite = {
  brand: site.brand,
  importName: site.importName ?? site.brand,
  logoSvg: site.logo?.svg,
  support: { wechat: site.supportWechat, email: site.contactEmail },
};

export type AuthAside = { headline: string; sub: string; highlights?: { icon: string; title: string; desc: string }[] };

// 登录、注册页左边的内容。landingPublic: false 时只放品牌名和介绍，不放卖点
export function authAside(lang: Lang): AuthAside {
  const L = site.landingPublic === false ? undefined : site.landing;
  return {
    headline: L ? pick(L.headline, lang) : site.brand,
    sub: pick(L?.sub ?? site.description, lang),
    highlights: L?.highlights?.slice(0, 4).map((h) => ({ icon: h.icon, title: pick(h.title, lang), desc: pick(h.desc, lang) })),
  };
}
