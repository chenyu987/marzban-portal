"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";
import Brand from "./Brand";
import { useT } from "./LangContext";
import { MenuButton, MenuSheet, useMenuOpen } from "./MobileMenu";

// 客人这边几个页面共用的导航：当前页高亮。宽屏直接摆在顶部，手机上是右上角的整屏菜单（见 MobileMenu.tsx）。
// 没登录（比如直接打开教程）只显示登录按钮
export default function CustomerNav({ loggedIn = true }: { loggedIn?: boolean }) {
  const path = usePathname();
  const t = useT();
  const [open, setOpen] = useMenuOpen();
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
        {!loggedIn ? (
          <Link href="/login" className="btn btn-primary btn-sm shrink-0">
            {t("登录", "Log in")}
          </Link>
        ) : (
          <>
            <form action={logout} className="hidden shrink-0 sm:block">
              <button className="btn btn-ghost btn-sm">{t("退出", "Log out")}</button>
            </form>
            <MenuButton open={open} onOpen={() => setOpen(true)} label={t("打开菜单", "Open menu")} />
          </>
        )}
      </header>

      {loggedIn && (
        <MenuSheet
          open={open}
          onClose={() => setOpen(false)}
          links={LINKS}
          isActive={(href) => path === href}
          logout={logout}
          labels={{ menu: t("菜单", "Menu"), open: t("打开菜单", "Open menu"), close: t("关闭菜单", "Close menu"), logout: t("退出", "Log out") }}
        />
      )}
    </>
  );
}
