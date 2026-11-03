"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";
import Brand from "./Brand";
import { useT } from "./LangContext";

// 图标（24×24 描边），底部标签栏用
const ICONS: Record<string, React.ReactNode> = {
  "/dashboard": <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 15h3" />,
  "/plans": <path d="M6 6h15l-1.5 9h-12zM6 6 5 3H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM18 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2z" />,
  "/tutorial": <path d="M12 6.5C10.5 5 8 4.5 4 4.5v13c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-13c-4 0-6.5.5-8 2zM12 6.5v13" />,
  "/account": <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5" />,
};

// 客人这边几个页面共用的导航：当前页高亮。
// 宽屏放在顶部；手机上顶部只留 logo 和退出，几个页面放到屏幕底部的标签栏（图标 + 文字，四个都看得到，不用横着滑）。
// 没登录（比如直接打开教程）只显示登录按钮
export default function CustomerNav({ loggedIn = true }: { loggedIn?: boolean }) {
  const path = usePathname();
  const t = useT();
  const LINKS = [
    { href: "/dashboard", label: t("我的订阅", "Subscription") },
    { href: "/plans", label: t("购买/续费", "Buy / Renew") },
    { href: "/tutorial", label: t("安装教程", "Setup guide") },
    { href: "/account", label: t("账户", "Account") },
  ];
  return (
    <>
      <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-base-300/60 bg-base-200/85 px-4 py-2 backdrop-blur">
        <Brand href={loggedIn ? "/dashboard" : "/"} size={28} className="mr-1 shrink-0 text-lg" />
        <nav className="-mx-1 hidden flex-1 items-center gap-1 px-1 whitespace-nowrap sm:flex">
          {loggedIn &&
            LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={path === l.href ? "page" : undefined}
                className={`btn btn-sm ${path === l.href ? "btn-soft btn-primary" : "btn-ghost"}`}
              >
                {l.label}
              </Link>
            ))}
        </nav>
        <span className="flex-1 sm:hidden" />
        {loggedIn ? (
          <form action={logout} className="shrink-0">
            <button className="btn btn-ghost btn-sm">{t("退出", "Log out")}</button>
          </form>
        ) : (
          <Link href="/login" className="btn btn-primary btn-sm shrink-0">
            {t("登录", "Log in")}
          </Link>
        )}
      </header>
      {loggedIn && (
        // globals.css 里 body:has(.tab-bar) 会在手机上给页面底部留出位置，免得标签栏挡住页脚
        <nav
          aria-label={t("页面", "Pages")}
          data-testid="tab-bar"
          className="tab-bar fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-base-300 bg-base-100/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
        >
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-xs ${active ? "font-semibold text-primary" : "text-base-content/60"}`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  {ICONS[l.href]}
                </svg>
                {l.label}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
