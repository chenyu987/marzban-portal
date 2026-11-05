"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useT } from "../LangContext";

// 后台列表的筛选：平时只露一个小小的「筛选」按钮；点开后筛选条件在按钮下面平滑展开，下面的表格跟着往下移
// （不盖住表头）。按 Esc 或再点一下按钮收起。
// 有条件在生效时按钮上显示几项，旁边给「清除」，不用点开也知道现在筛过了。
// 「几项」在浏览器里数：没隐藏的输入框有值、下拉框不是默认的那个，就算一项。
// 不要「筛选」按钮：下拉框、日期一改就生效，搜索框按回车生效。样式在 globals.css 的 .filter-panel（浅底胶囊，没有边框）
export default function FilterPopover({ base, children }: { base: string; children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const form = useRef<HTMLFormElement>(null);

  // 开着还是收着记在这个标签页里（sessionStorage）：下拉框一改页面就刷新，刷新后面板还开着，能接着选
  const key = `admin-filter-open:${base}`;
  useEffect(() => {
    try {
      if (sessionStorage.getItem(key) === "1") setOpen(true);
    } catch {
      // 存不了就每次收着
    }
  }, [key]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      sessionStorage.setItem(key, next ? "1" : "0");
    } catch {
      // 存不了就算了
    }
  };

  useEffect(() => {
    const f = form.current;
    if (!f) return;
    let n = 0;
    f.querySelectorAll<HTMLInputElement>("input:not([type=hidden])").forEach((i) => i.value && n++);
    // 下拉框带 data-default 的（比如按管理员偏好的默认排序）和它比，没带的和第一个选项比
    for (const s of Array.from(f.elements))
      if (s instanceof HTMLSelectElement && (s.dataset.default !== undefined ? s.value !== s.dataset.default : s.selectedIndex > 0)) n++;
    setCount(n);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && toggle();
    document.addEventListener("keydown", onKey);
    // 打开时光标落在第一个输入框，直接打字搜
    form.current?.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className={`btn btn-sm gap-1.5 rounded-full font-normal ${open || count ? "btn-soft btn-primary" : "btn-ghost text-base-content/70"}`}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
            <path fill="currentColor" d="M3 4.75A.75.75 0 0 1 3.75 4h12.5a.75.75 0 0 1 .53 1.28L12 10.06v4.19a.75.75 0 0 1-.33.62l-2.5 1.67A.75.75 0 0 1 8 15.92v-5.86L3.22 5.28A.75.75 0 0 1 3 4.75Z" />
          </svg>
          {t("筛选", "Filter")}
          {count > 0 && <span className="badge badge-xs badge-primary">{count}</span>}
          <svg viewBox="0 0 20 20" className={`size-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} aria-hidden>
            <path fill="currentColor" d="M5.22 7.22a.75.75 0 0 1 1.06 0L10 10.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.28a.75.75 0 0 1 0-1.06Z" />
          </svg>
        </button>
        {count > 0 && (
          <Link href={base} className="btn btn-ghost btn-sm rounded-full font-normal text-base-content/60">
            {t("清除", "Clear")}
          </Link>
        )}
      </div>

      {/* 一直挂着（表单里填了一半的不丢）。展开：高度从 0 平滑长到内容那么高，下面的表格跟着往下移；收起反过来 */}
      <div
        inert={!open}
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <form
            ref={form}
            onChange={(e) => {
              const el = e.target as HTMLElement;
              if (el instanceof HTMLSelectElement || (el instanceof HTMLInputElement && el.type === "date")) form.current?.requestSubmit();
            }}
            className="filter-panel mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-base-100 p-2 shadow-sm"
          >
            {children}
            {/* 看不见的提交按钮：有日期框的表单，没有它按回车不会提交 */}
            <button className="sr-only" tabIndex={-1}>
              {t("筛选", "Filter")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
