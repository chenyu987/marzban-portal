"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "./actions";
import Brand from "./Brand";

const LINKS = [
  { href: "/dashboard", label: "我的订阅" },
  { href: "/plans", label: "购买/续费" },
  { href: "/tutorial", label: "安装教程" },
  { href: "/account", label: "账户" },
];

// 客人这边几个页面共用的顶部导航：当前页高亮，窄屏横向滑动。没登录（比如直接打开教程）只显示登录按钮
export default function CustomerNav({ loggedIn = true }: { loggedIn?: boolean }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-base-300/60 bg-base-200/85 px-4 py-2 backdrop-blur">
      <Brand href={loggedIn ? "/dashboard" : "/"} size={28} className="mr-1 shrink-0 text-lg" />
      <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 whitespace-nowrap">
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
      {loggedIn ? (
        <form action={logout} className="shrink-0">
          <button className="btn btn-ghost btn-sm">退出</button>
        </form>
      ) : (
        <Link href="/login" className="btn btn-primary btn-sm shrink-0">
          登录
        </Link>
      )}
    </header>
  );
}
