"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 手机上的整屏菜单，客人页和管理后台共用：顶部只有 logo 和右上角的「≡」，点开是整屏菜单（几个页面 + 最下面的退出，学 Apple 官网），右上角「×」关掉。

export type MenuLink = { href: string; label: string };
export type MenuLabels = { menu: string; open: string; close: string; logout: string };

// 换了页面就收起菜单；菜单开着时后面的页面不跟着滚
export function useMenuOpen() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
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
  return [open, setOpen] as const;
}

// header 右上角的「≡」，只在手机上显示
export function MenuButton({ open, onOpen, label }: { open: boolean; onOpen: () => void; label: string }) {
  return (
    <button type="button" onClick={onOpen} aria-label={label} aria-expanded={open} className="btn btn-ghost btn-square btn-sm -mr-1 sm:hidden">
      <MenuIcon cross={false} />
    </button>
  );
}

// 整屏菜单要放在 header 外面：header 有 backdrop-blur，里面的 fixed 元素会被限制在 header 里。
// 学 Apple 官网的动画：一直挂在页面上、收着时看不见；点开时白底从上往下展开，「≡」两道线转成「×」，
// 几个链接从上面一点依次淡入；关上时反过来、不等。系统设了「减少动态效果」就不动
export function MenuSheet({
  open,
  onClose,
  links,
  isActive,
  logout,
  labels,
}: {
  open: boolean;
  onClose: () => void;
  links: MenuLink[];
  isActive: (href: string) => boolean;
  logout: () => Promise<void>;
  labels: MenuLabels;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={labels.menu}
      aria-hidden={!open}
      inert={!open}
      className={`fixed inset-0 z-30 flex flex-col overflow-y-auto bg-base-100 pb-10 transition-[clip-path,visibility] duration-400 ease-[cubic-bezier(0.4,0,0.6,1)] motion-reduce:transition-none sm:hidden ${
        open ? "visible [clip-path:inset(0_0_0_0)]" : "invisible [clip-path:inset(0_0_100%_0)]"
      }`}
    >
      {/* 和 header 同样的高度和边距，「×」正好落在「≡」的位置上 */}
      <div className="flex justify-end px-4 py-2">
        <button type="button" onClick={onClose} aria-label={labels.close} className="btn btn-ghost btn-square btn-sm -mr-1">
          <MenuIcon cross={open} />
        </button>
      </div>
      <nav className="mt-4 flex flex-col px-6">
        {links.map((l, i) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={onClose}
            aria-current={isActive(l.href) ? "page" : undefined}
            style={{ transitionDelay: open ? `${120 + i * 40}ms` : "0ms" }}
            className={`py-3 text-3xl font-semibold transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none ${isActive(l.href) ? "text-primary" : ""} ${
              open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <form
        action={logout}
        style={{ transitionDelay: open ? `${120 + links.length * 40}ms` : "0ms" }}
        className={`mt-8 px-6 transition-[opacity,translate] duration-300 ease-out motion-reduce:transition-none ${open ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
      >
        <button className="py-3 text-lg">{labels.logout}</button>
      </form>
    </div>
  );
}

// 两道横线；cross 为 true 时各自转 45° 叠成「×」（带过渡，就是菜单打开时那个变形）
function MenuIcon({ cross }: { cross: boolean }) {
  const line = "absolute left-1 h-[1.5px] w-5 rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.6,1)] motion-reduce:transition-none";
  return (
    <span className="relative block h-6 w-7" aria-hidden>
      <span className={`${line} top-[7.5px] ${cross ? "translate-y-[4px] rotate-45" : ""}`} />
      <span className={`${line} top-[15.5px] ${cross ? "-translate-y-[4px] -rotate-45" : ""}`} />
    </span>
  );
}
