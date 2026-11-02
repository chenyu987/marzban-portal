import type { Metadata, Viewport } from "next";
import { site } from "@/site.config";
import "./globals.css";

export const metadata: Metadata = { title: site.brand, description: site.description };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col bg-base-200">
        <div className="flex-1">{children}</div>
        {site.contactEmail && (
          <footer className="py-6 text-center text-sm text-base-content/60">
            联系我们：
            <a href={`mailto:${site.contactEmail}`} className="link">
              {site.contactEmail}
            </a>
          </footer>
        )}
      </body>
    </html>
  );
}
