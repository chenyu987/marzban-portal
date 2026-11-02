"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 后台导航按用途分三组：日常（订单、客人、Marzban 用户、兑换码）、线路（节点、Host）、记录（日志）。
// 当前页高亮；窄屏横向滑动，不换行
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

export default function AdminNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="-mx-1 flex flex-1 items-center gap-1 overflow-x-auto px-1 whitespace-nowrap">
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
  );
}
