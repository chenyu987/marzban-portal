"use client";

import { hideSubscription, unhideSubscription } from "../actions";
import { confirmSubmit } from "../ConfirmDialog";
import { useT } from "../LangContext";

// 主页上「从主页隐藏」（过期或已删除的订阅）和「重新显示」。隐藏只是不显示，记录都留着。
// prominent：过期的卡片上做成显眼的描边按钮，客人一眼看到能收起来
export default function HideButton({ username, unhide = false, prominent = false }: { username: string; unhide?: boolean; prominent?: boolean }) {
  const t = useT();
  return (
    <form
      action={unhide ? unhideSubscription : hideSubscription}
      onSubmit={(e) => {
        if (!unhide)
          confirmSubmit(e, t("从主页隐藏这个订阅？记录会保留，以后可以在主页底部重新显示。", "Hide this subscription from your page? Its records are kept and you can show it again at the bottom of the page."), {
            ok: t("隐藏", "Hide"),
          });
      }}
    >
      <input type="hidden" name="username" value={username} />
      <button className={prominent ? "btn btn-outline btn-primary btn-sm" : "btn btn-ghost btn-xs text-base-content/60"}>{unhide ? t("重新显示", "Show again") : t("从主页隐藏", "Hide")}</button>
    </form>
  );
}
