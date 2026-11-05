import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import ContactSupport from "./ContactSupport";
import ConfirmHost from "./ConfirmDialog";
import { SiteProvider } from "./SiteContext";
import { publicSite } from "@/lib/public-site";
import { getT } from "@/lib/lang";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme, themeAttr } from "@/lib/theme";
import { LOCALE } from "@/lib/i18n";
import { LangProvider } from "./LangContext";
import HideOnAdmin from "./HideOnAdmin";
import LangSwitch from "./LangSwitch";
import WechatHint from "./WechatHint";
import "./globals.css";
import TzSync from "./TzSync";

export async function generateMetadata(): Promise<Metadata> {
  const { p } = await getT();
  return {
    title: { default: site.brand, template: `%s · ${site.brand}` },
    description: p((site.landingPublic === false ? undefined : site.landing?.sub) ?? site.description),
    icons: site.logo ? { icon: site.logo.svg, apple: site.logo.appleTouch } : undefined,
    appleWebApp: { title: site.brand, capable: true, statusBarStyle: "default" },
    robots: site.noindex ? { index: false, follow: false } : undefined,
  };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: site.themeColor };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getT();
  const theme = themeAttr(parseTheme((await cookies()).get(THEME_COOKIE)?.value));
  return (
    <html lang={LOCALE[lang]} data-theme={theme}>
      <body className="flex min-h-screen flex-col bg-base-200">
        <SiteProvider value={publicSite}>
        <LangProvider value={lang}>
        <TzSync />
        <WechatHint />
        <div className="flex-1">{children}</div>
        <footer className="flex flex-col items-center gap-3 border-t border-base-300/60 px-4 py-8 text-sm text-base-content/60">
          <HideOnAdmin>{(site.contactEmail || site.supportWechat) && <ContactSupport className="justify-center" />}</HideOnAdmin>
          <LangSwitch />
          <p className="text-xs text-base-content/40">
            © {new Date().getFullYear()} {site.brand}
          </p>
        </footer>
        <ConfirmHost />
        </LangProvider>
        </SiteProvider>
      </body>
    </html>
  );
}
