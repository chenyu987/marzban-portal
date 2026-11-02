import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import ContactSupport from "./ContactSupport";
import "./globals.css";

export const metadata: Metadata = { title: site.brand, description: site.description };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

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
