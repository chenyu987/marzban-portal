import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import Link from "next/link";
import ContactSupport from "./ContactSupport";
import ConfirmHost from "./ConfirmDialog";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: site.brand, template: `%s · ${site.brand}` },
  description: site.landing?.sub ?? site.description,
  icons: site.logo ? { icon: site.logo.svg, apple: site.logo.appleTouch } : undefined,
  appleWebApp: { title: site.brand, capable: true, statusBarStyle: "default" },
  robots: site.noindex ? { index: false, follow: false } : undefined,
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: site.themeColor };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-base-200">
        <div className="flex-1">{children}</div>
        <footer className="flex flex-col items-center gap-3 border-t border-base-300/60 px-4 py-8 text-sm text-base-content/60">
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1">
            <Link href="/" className="link link-hover">
              首页
            </Link>
            <Link href="/#pricing" className="link link-hover">
              套餐价格
            </Link>
            <Link href="/tutorial" className="link link-hover">
              安装教程
            </Link>
            <Link href="/dashboard" className="link link-hover">
              我的订阅
            </Link>
          </nav>
          {(site.contactEmail || site.supportWechat) && <ContactSupport className="justify-center" />}
          <p className="text-xs text-base-content/40">
            © {new Date().getFullYear()} {site.brand}
          </p>
        </footer>
        <ConfirmHost />
      </body>
    </html>
  );
}
