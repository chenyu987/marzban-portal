"use client";

import { useEffect, useState } from "react";
import { useT } from "../LangContext";

// 分流规则的添加步骤默认收起，不想加的客人直接往下看「连接」。
// 展开 / 收起记在这台设备的浏览器里（localStorage），Mac 和 Windows 两个标签页共用一个状态：
// 想加规则的客人展开一次，以后再打开教程还是展开的，不用每次找按钮；展开后又收起，下次也是收起的。
// 没点过就是默认收起。记不了（无痕模式）就只管这一次。
// 内容一直渲染在页面里，只用 hidden 藏起来，截图和规则文本都是服务端出的
const KEY = "tutorial-rules-open";

export default function RulesToggle({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") setOpen(true);
    } catch {}
    // 页面上 Mac、Windows 各有一个，点了一个另一个跟着变，切标签页时两边一致
    const sync = (e: Event) => setOpen((e as CustomEvent<boolean>).detail);
    window.addEventListener(KEY, sync);
    return () => window.removeEventListener(KEY, sync);
  }, []);

  function toggle() {
    const next = !open;
    window.dispatchEvent(new CustomEvent(KEY, { detail: next }));
    // 展开记 1，展开后又收起记 0：两种都记住，下次打开照最后一次点的样子
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {}
  }

  return (
    <>
      <button type="button" onClick={toggle} aria-expanded={open} className="btn btn-primary btn-sm mt-3">
        {open ? t("收起 ▴", "Hide ▴") : t("展开说明和添加步骤 ▾", "Details and steps ▾")}
      </button>
      <div hidden={!open} data-testid="rules-steps">
        {children}
      </div>
    </>
  );
}
