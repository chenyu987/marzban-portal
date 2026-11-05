"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminSearch, type SearchHit } from "./search";
import { useT } from "../LangContext";
import type { T } from "@/lib/i18n";

// 不输字时列出各个页面，当快捷跳转用
const pages = (t: T): SearchHit[] => [
  { group: "page", title: t("订单", "Orders"), sub: t("待处理和全部订单", "To-do and all orders"), href: "/admin" },
  { group: "page", title: t("客人", "Customers"), sub: "", href: "/admin/customers" },
  { group: "page", title: t("订阅", "Subscriptions"), sub: t("Marzban 用户", "Marzban users"), href: "/admin/users" },
  { group: "page", title: t("新建订阅", "New subscription"), sub: "", href: "/admin/users/new" },
  { group: "page", title: t("兑换码", "Codes"), sub: "", href: "/admin/codes" },
  { group: "page", title: t("节点", "Nodes"), sub: "", href: "/admin/nodes" },
  { group: "page", title: "Host", sub: "", href: "/admin/hosts" },
  { group: "page", title: t("日志", "Logs"), sub: "", href: "/admin/logs" },
  { group: "page", title: t("我的账户", "My account"), sub: t("外观、偏好、登录设备、改密码", "Appearance, preferences, devices, password"), href: "/admin/account" },
];
const groupLabel = (t: T): Record<SearchHit["group"], string> => ({
  customer: t("客人", "Customers"),
  sub: t("订阅", "Subscriptions"),
  order: t("订单", "Orders"),
  page: t("页面", "Pages"),
});

// 后台全局搜索：⌘K / Ctrl+K 打开，搜客人、订阅、订单号；上下键选，回车跳过去，Esc 关
export default function CommandPalette() {
  const router = useRouter();
  const t = useT();
  const PAGES = pages(t);
  const GROUP = groupLabel(t);
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const [mac, setMac] = useState(true);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 停 200ms 再搜，打字时不连发
  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const timer = setTimeout(() => start(async () => setHits(await adminSearch(q))), 200);
    return () => clearTimeout(timer);
  }, [q]);

  const filteredPages = q.trim() ? PAGES.filter((p) => p.title.toLowerCase().includes(q.trim().toLowerCase())) : PAGES;
  const list = [...hits, ...filteredPages];
  useEffect(() => setActive(0), [q, hits.length]);

  function open() {
    if (dialog.current?.open) return;
    dialog.current?.showModal();
    setTimeout(() => input.current?.select(), 0);
  }
  function go(h: SearchHit) {
    dialog.current?.close();
    setQ("");
    router.push(h.href);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(list.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && list[active]) {
      e.preventDefault();
      go(list[active]);
    }
  }

  return (
    <>
      <button type="button" onClick={open} className="btn btn-ghost btn-sm shrink-0 gap-2 font-normal text-base-content/60" aria-label={t("搜索", "Search")}>
        <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
          <path fill="currentColor" d="M8.5 3a5.5 5.5 0 0 1 4.38 8.83l3.65 3.64a.75.75 0 1 1-1.06 1.06l-3.64-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
        </svg>
        <span className="hidden xl:inline">{t("搜索", "Search")}</span>
        <kbd className="kbd kbd-xs hidden lg:inline-flex">{mac ? "⌘K" : "Ctrl K"}</kbd>
      </button>
      <dialog ref={dialog} className="modal modal-top sm:modal-middle" aria-label={t("全局搜索", "Search everything")} onClose={() => setQ("")}>
        <div className="modal-box max-w-xl p-0">
          <div className="flex items-center gap-2 border-b border-base-300 px-4">
            <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-base-content/50" aria-hidden>
              <path fill="currentColor" d="M8.5 3a5.5 5.5 0 0 1 4.38 8.83l3.65 3.64a.75.75 0 1 1-1.06 1.06l-3.64-3.65A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
            </svg>
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={t("搜客人邮箱、微信号、订阅名、订阅编号、订单号", "Customer email, WeChat ID, subscription name or code, order no.")}
              aria-label={t("搜索内容", "Search text")}
              className="h-12 w-full bg-transparent text-sm outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            {pending && <span className="loading loading-spinner loading-xs text-base-content/50" />}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox" data-testid="search-results">
            {list.map((h, i) => (
              <li key={`${h.group}-${h.href}`} role="option" aria-selected={i === active}>
                {(i === 0 || list[i - 1].group !== h.group) && <div className="px-2 pt-2 pb-1 text-xs text-base-content/50">{GROUP[h.group]}</div>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h)}
                  className={`flex w-full items-baseline gap-3 rounded-btn px-2 py-2 text-left text-sm ${i === active ? "bg-primary/10 text-primary" : ""}`}
                >
                  <span className="shrink-0 font-medium">{h.title}</span>
                  {h.sub && <span className="truncate text-xs text-base-content/50">{h.sub}</span>}
                </button>
              </li>
            ))}
            {q.trim() && !pending && list.length === 0 && <li className="px-2 py-6 text-center text-sm text-base-content/50">{t("没搜到", "No results")}</li>}
          </ul>
          <div className="flex gap-4 border-t border-base-300 px-4 py-2 text-xs text-base-content/50">
            <span>
              <kbd className="kbd kbd-xs">↑</kbd> <kbd className="kbd kbd-xs">↓</kbd> {t("选", "select")}
            </span>
            <span>
              <kbd className="kbd kbd-xs">Enter</kbd> {t("打开", "open")}
            </span>
            <span>
              <kbd className="kbd kbd-xs">Esc</kbd> {t("关", "close")}
            </span>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button aria-label={t("关闭", "Close")}>{t("关闭", "Close")}</button>
        </form>
      </dialog>
    </>
  );
}
