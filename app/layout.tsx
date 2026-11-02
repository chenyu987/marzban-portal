import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import ContactSupport from "./ContactSupport";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: site.brand, template: `%s · ${site.brand}` },
  description: site.landing?.sub ?? site.description,
  icons: site.logo ? { icon: site.logo.svg, apple: site.logo.appleTouch } : undefined,
  appleWebApp: { title: site.brand, capable: true, statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: site.themeColor };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-base-200">
        <div className="flex-1">{children}</div>
        {(site.contactEmail || site.supportWechat) && (
          <footer className="py-6">
            <ContactSupport className="justify-center" />
          </footer>
        )}
      </body>
    </html>
  );
}
