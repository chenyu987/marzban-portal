"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useT } from "./LangContext";

// 页面里自己画的确认框，代替浏览器的 confirm()。
// 手机浏览器的 confirm() 会多一个「Suppress dialogs / 阻止此页面再弹出对话框」，客人点了以后 confirm() 一直返回 false，就再也下不了单
type Request = { message: string; ok: string; danger: boolean; resolve: (yes: boolean) => void };
let show: ((r: Request) => void) | null = null;

export function askConfirm(message: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  // ConfirmHost 还没挂上（理论上不会）时退回浏览器自带的
  if (!show) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => show!({ message, ok: opts.ok ?? "", danger: !!opts.danger, resolve }));
}

// 表单 onSubmit 里用：先拦下提交，弹确认框，点了确定再用同一个提交按钮重新提交（按钮的 name / value 照样带上）
export function confirmSubmit(e: FormEvent<HTMLFormElement>, message: string, opts?: { ok?: string; danger?: boolean }) {
  const form = e.currentTarget;
  if (form.dataset.confirmed === "1") {
    delete form.dataset.confirmed;
    return;
  }
  e.preventDefault();
  const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
  askConfirm(message, opts).then((yes) => {
    if (!yes) return;
    form.dataset.confirmed = "1";
    form.requestSubmit(submitter ?? undefined);
  });
}

// 放在根布局里，整站共用一个
export default function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();

  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (req && !ref.current?.open) ref.current?.showModal();
  }, [req]);

  function answer(yes: boolean) {
    req?.resolve(yes);
    setReq(null);
    ref.current?.close();
  }

  return (
    <dialog ref={ref} className="modal modal-bottom sm:modal-middle" onCancel={() => answer(false)} aria-label={t("确认", "Confirm")}>
      <div className="modal-box">
        <p className="text-base whitespace-pre-line">{req?.message}</p>
        <div className="modal-action">
          <button type="button" className="btn" onClick={() => answer(false)}>
            {t("取消", "Cancel")}
          </button>
          <button type="button" className={`btn ${req?.danger ? "btn-error" : "btn-primary"}`} onClick={() => answer(true)} autoFocus>
            {req?.ok || t("确定", "OK")}
          </button>
        </div>
      </div>
      <div className="modal-backdrop" onClick={() => answer(false)} />
    </dialog>
  );
}
