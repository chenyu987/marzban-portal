"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminLogout } from "./actions";
import { Logo } from "../Brand";
import { MenuButton, MenuSheet, useMenuOpen } from "../MobileMenu";
import CommandPalette from "./CommandPalette";

// 后台导航按用途分三组：日常（订单、客人、Marzban 用户、兑换码）、线路（节点、Host）、记录（日志）。
// 当前页高亮；宽屏摆在顶部，太窄时横向滑动不换行；手机上和客人页一样是右上角的整屏菜单（见 MobileMenu.tsx）
const GROUPS: { href: string; label: string }[][] = [
  [
    { href: "/admin", label: "订单" },
    { href: "/admin/customers", label: "客人" },
    { href: "/admin/users", label: "订阅" },
    { href: "/admin/codes", label: "兑换码" },
  ],
  [
    { href: "/admin/nodes", label: "节点" },
    { href: "/admin/hosts", label: "Host" },
  ],
  [{ href: "/admin/logs", label: "日志" }],
];
const MENU_LINKS = [...GROUPS.flat(), { href: "/admin/account", label: "账户" }];
// 后台只有中文，不跟着语言走
const MENU_LABELS = { menu: "菜单", open: "打开菜单", close: "关闭菜单", logout: "退出" };

export default function AdminHeader({ email }: { email: string }) {
  const path = usePathname();
  const [open, setOpen] = useMenuOpen();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <>
      <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-base-300 bg-base-200/90 px-4 py-2 backdrop-blur">
        <Link href="/admin" className="mr-1 flex shrink-0 items-center gap-2 text-lg font-bold">
          <Logo size={26} />
          管理后台
        </Link>
        <nav className="-mx-1 hidden flex-1 items-center gap-1 overflow-x-auto px-1 whitespace-nowrap sm:flex">
          {GROUPS.map((g, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <span className="mx-1 h-4 w-px bg-base-300" aria-hidden />}
              {g.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active(l.href) ? "page" : undefined}
                  className={`btn btn-sm ${active(l.href) ? "btn-soft btn-primary" : "btn-ghost"}`}
                >
                  {l.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <span className="flex-1 sm:hidden" />
        <CommandPalette />
        {/* 右上角「账户」，和客人那边一样；在账户页时高亮，鼠标停上去显示登录的邮箱。手机上在菜单里 */}
        <Link
          href="/admin/account"
          title={email}
          aria-current={active("/admin/account") ? "page" : undefined}
          className={`btn btn-sm shrink-0 max-sm:hidden ${active("/admin/account") ? "btn-soft btn-primary" : "btn-ghost"}`}
        >
          账户
        </Link>
        <form action={adminLogout} className="hidden shrink-0 sm:block">
          <button className="btn btn-ghost btn-sm">退出</button>
        </form>
        <MenuButton open={open} onOpen={() => setOpen(true)} label={MENU_LABELS.open} />
      </header>
      <MenuSheet open={open} onClose={() => setOpen(false)} links={MENU_LINKS} isActive={active} logout={adminLogout} labels={MENU_LABELS} />
    </>
  );
}
