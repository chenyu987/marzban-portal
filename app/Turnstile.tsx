"use client";

import { useEffect, useRef } from "react";
import { useLang } from "./LangContext";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile script failed"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

// 人机验证框。放在 <form> 里，通过后自动往表单里加 cf-turnstile-response。
// resetKey 变了（比如提交后服务器返回了错误）就重新验证一次：每个验证结果只能用一次
export default function Turnstile({ siteKey, resetKey }: { siteKey: string; resetKey?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const lang = useLang();

  useEffect(() => {
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        id.current = window.turnstile.render(box.current, { sitekey: siteKey, theme: "auto", language: lang === "en" ? "en" : "zh-cn", size: "flexible" });
      })
      .catch((e) => console.error(e));
    return () => {
      gone = true;
      if (id.current && window.turnstile) window.turnstile.remove(id.current);
      id.current = null;
    };
  }, [siteKey, lang]);

  useEffect(() => {
    if (resetKey && id.current && window.turnstile) window.turnstile.reset(id.current);
  }, [resetKey]);

  return <div ref={box} className="min-h-[65px]" />;
}
