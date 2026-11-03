"use client";

import { useEffect, useState } from "react";
import { useT } from "./LangContext";
import { isWechat } from "@/lib/wechat";

// 在微信里直接点开的链接，登录状态有时保存不住（登录完又被弹回登录页），提示客人换到系统浏览器打开
export default function WechatHint() {
  const t = useT();
  const [show, setShow] = useState(false);
  useEffect(() => setShow(isWechat(navigator.userAgent)), []);
  if (!show) return null;
  return (
    <div role="alert" className="alert alert-warning rounded-none text-sm">
      {t(
        "你正在微信里打开本站，登录可能保存不住。请点右上角「···」，选「在浏览器打开」。",
        "You're in WeChat's built-in browser, which may not keep you signed in. Tap ··· at the top right and choose Open in Browser.",
      )}
    </div>
  );
}
