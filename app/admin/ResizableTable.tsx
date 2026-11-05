"use client";

import { useEffect, useRef } from "react";
import { useT } from "../LangContext";

// 后台列表的表格：像 Excel 一样，按住表头两列中间的竖线左右拖就能调这一列的宽窄，双击竖线恢复自动宽度。
// 拖过的宽度按表格 id 记在这台设备的浏览器里（localStorage），下次打开还是这样；记不了（无痕模式）就只管这一次。
// 表头、内容还是服务器渲染的，这里只在浏览器里给每个 <th> 加一个拖动把手。
// 拖过以后表格改成固定列宽，放不下的字显示成「…」（鼠标停上去看全文，见 globals.css 的 .resizable-table）
const MIN = 48;
const key = (id: string) => `admin-cols:${id}`;

function load(id: string): Record<number, number> {
  try {
    return JSON.parse(localStorage.getItem(key(id)) ?? "{}");
  } catch {
    return {};
  }
}
function save(id: string, widths: Record<number, number>) {
  try {
    if (Object.keys(widths).length) localStorage.setItem(key(id), JSON.stringify(widths));
    else localStorage.removeItem(key(id));
  } catch {
    // 存不了就算了
  }
}

export default function ResizableTable({ id, className = "", children }: { id: string; className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLTableElement>(null);
  const t = useT();
  const hint = t("拖动调宽窄，双击恢复", "Drag to resize, double-click to reset");

  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const ths = Array.from(table.querySelectorAll<HTMLTableCellElement>("thead th"));
    let widths = load(id);

    // 固定列宽：先量出现在每一列多宽，再把拖过的那几列换成记下的宽度
    const fix = () => {
      const measured = ths.map((th) => th.getBoundingClientRect().width);
      ths.forEach((th, i) => (th.style.width = `${widths[i] ?? measured[i]}px`));
      table.style.tableLayout = "fixed";
      table.style.width = `${ths.reduce((sum, th) => sum + Number.parseFloat(th.style.width), 0)}px`;
      table.dataset.resized = "1";
    };
    const unfix = () => {
      ths.forEach((th) => (th.style.width = ""));
      table.style.tableLayout = "";
      table.style.width = "";
      delete table.dataset.resized;
    };
    if (Object.keys(widths).length) fix();

    const cleanups: (() => void)[] = [];
    ths.forEach((th, i) => {
      if (i === ths.length - 1) return; // 最后一列拖右边没意义
      th.style.position = "relative";
      const handle = document.createElement("div");
      handle.title = hint;
      handle.setAttribute("aria-hidden", "true");
      handle.className = "col-resizer";
      const onDouble = () => {
        const { [i]: _, ...rest } = widths;
        widths = rest;
        save(id, widths);
        unfix();
        if (Object.keys(widths).length) fix();
      };
      let lastDown = 0;
      const onDown = (e: PointerEvent) => {
        e.preventDefault();
        // 双击（0.4 秒内按两下）：恢复这一列的自动宽度
        if (e.timeStamp - lastDown < 400) {
          lastDown = 0;
          onDouble();
          return;
        }
        lastDown = e.timeStamp;
        if (!table.dataset.resized) fix();
        const startX = e.clientX;
        const start = Number.parseFloat(th.style.width);
        const tableStart = Number.parseFloat(table.style.width);
        handle.setPointerCapture(e.pointerId);
        const onMove = (m: PointerEvent) => {
          const w = Math.max(MIN, start + m.clientX - startX);
          th.style.width = `${w}px`;
          table.style.width = `${tableStart + w - start}px`;
        };
        const onUp = () => {
          handle.removeEventListener("pointermove", onMove);
          handle.removeEventListener("pointerup", onUp);
          widths = { ...widths, [i]: Math.round(Number.parseFloat(th.style.width)) };
          save(id, widths);
        };
        handle.addEventListener("pointermove", onMove);
        handle.addEventListener("pointerup", onUp);
      };
      handle.addEventListener("pointerdown", onDown);
      th.appendChild(handle);
      cleanups.push(() => handle.remove());
    });
    // 拖窄后被截成「…」的格子，鼠标停上去显示全文
    const onOver = (e: MouseEvent) => {
      const cell = (e.target as HTMLElement).closest("td");
      if (cell && table.dataset.resized && cell.scrollWidth > cell.clientWidth && !cell.title) cell.title = cell.innerText.trim();
    };
    table.addEventListener("mouseover", onOver);
    cleanups.push(() => table.removeEventListener("mouseover", onOver));
    return () => cleanups.forEach((c) => c());
  }, [id, hint]);

  return (
    <table ref={ref} className={`resizable-table ${className}`}>
      {children}
    </table>
  );
}
