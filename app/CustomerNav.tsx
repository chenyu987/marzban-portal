"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "./actions";
import Brand from "./Brand";
import { useT } from "./LangContext";

// 客人这边几个页面共用的导航：当前页高亮。
// 宽屏直接摆在顶部；手机上顶部只有 logo 和右上角的「≡」，点开是整屏菜单（几个页面 + 最下面的退出，学 Apple 官网），右上角「×」关掉。
// 没登录（比如直接打开教程）只显示登录按钮
export default function CustomerNav({ loggedIn = true }: { loggedIn?: boolean }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useState(false);
  const LINKS = [
    { href: "/dashboard", label: t("我的订阅", "Subscription") },
    { href: "/plans", label: t("购买/续费", "Buy / Renew") },
    { href: "/tutorial", label: t("安装教程", "Setup guide") },
    { href: "/account", label: t("账户", "Account") },
  ];

  // 换了页面就收起菜单；菜单开着时后面的页面不跟着滚
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

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
        {!loggedIn ? (
          <Link href="/login" className="btn btn-primary btn-sm shrink-0">
            {t("登录", "Log in")}
          </Link>
        ) : (
          <>
            <form action={logout} className="hidden shrink-0 sm:block">
              <button className="btn btn-ghost btn-sm">{t("退出", "Log out")}</button>
            </form>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={t("打开菜单", "Open menu")}
              aria-expanded={open}
              className="btn btn-ghost btn-square btn-sm -mr-1 sm:hidden"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                <path d="M4 8h16M4 16h16" />
              </svg>
            </button>
          </>
        )}
      </header>

      {/* 整屏菜单放在 header 外面：header 有 backdrop-blur，里面的 fixed 元素会被限制在 header 里 */}
      {loggedIn && open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("菜单", "Menu")}
          className="fixed inset-0 z-30 flex flex-col overflow-y-auto bg-base-100 px-6 pt-2 pb-10 sm:hidden"
        >
          <div className="flex justify-end">
            <button type="button" onClick={() => setOpen(false)} aria-label={t("关闭菜单", "Close menu")} className="btn btn-ghost btn-square">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <nav className="mt-4 flex flex-col">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                aria-current={path === l.href ? "page" : undefined}
                className={`py-3 text-3xl font-semibold ${path === l.href ? "text-primary" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <form action={logout} className="mt-8">
            <button className="py-3 text-lg text-error">{t("退出", "Log out")}</button>
          </form>
        </div>
      )}
    </>
  );
}
