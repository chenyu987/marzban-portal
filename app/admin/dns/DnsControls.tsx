"use client";

import { useId, useState, useTransition } from "react";
import type { FormState } from "../../actions";
import { adminSwitchDns } from "../actions";
import { useT } from "../../LangContext";
import { checkIPv4 } from "@/lib/dns-switch";

// 一条记录下面的「改到」：填新 IP（也可以从面板里登记过的节点里选），确认后改 DNS
export function SwitchForm({ zone, record, name, current, choices }: { zone: string; record: string; name: string; current: string; choices: { ip: string; name: string; standby?: boolean }[] }) {
  const t = useT();
  const list = useId();
  const [ip, setIp] = useState("");
  const [result, setResult] = useState<FormState>();
  const [pending, start] = useTransition();

  const submit = (value?: string) => {
    const next = (value ?? ip).trim();
    if (!next) return;
    // 格式不对、内网地址这类明显的错，先在这里拦下，不弹确认框（服务器那边还会再查一遍）
    const checked = checkIPv4(next);
    if ("error" in checked) {
      setResult({
        error: checked.error === "format" ? t("IP 格式不对，要是四段数字，用点隔开", "Invalid IP: four numbers separated by dots") : t("这是内网或保留地址，客人连不上", "That's a private or reserved address; customers can't reach it"),
      });
      return;
    }
    if (next === current) {
      setResult({ error: t(`${name} 已经是 ${next} 了`, `${name} already points to ${next}`) });
      return;
    }
    const known = choices.find((c) => c.ip === next);
    const warn = known?.standby
      ? t(
          `新 IP 是备用机「${known.name}」。它会在 30 秒内自动变成这个节点，不用登录服务器。`,
          `The new IP is standby "${known.name}". It turns itself into this node within 30 seconds; no server login needed.`,
        )
      : known
      ? t(`新 IP 是面板里的节点「${known.name}」。`, `The new IP is panel node "${known.name}".`)
      : t("⚠️ 新 IP 不是面板里的任何节点，确认它已经装好节点、连上面板了。", "⚠️ The new IP isn't any panel node. Make sure it already runs the node and is connected to the panel.");
    const ok = confirm(
      t(
        `把 ${name} 从 ${current} 改到 ${next}？\n\n${warn}\n用这个域名的客人会在 1～5 分钟内连到新 IP；新 IP 上没跑同一个入站的话，他们会断线。`,
        `Point ${name} from ${current} to ${next}?\n\n${warn}\nCustomers on this domain move to the new IP within 1-5 minutes; if it doesn't serve the same inbound, they'll be cut off.`,
      ),
    );
    if (!ok) return;
    const form = new FormData();
    form.set("zone", zone);
    form.set("record", record);
    form.set("ip", next);
    setResult(undefined);
    start(async () => {
      const r = await adminSwitchDns(undefined, form);
      setResult(r);
      if (r?.ok) setIp("");
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input input-sm w-56 font-mono"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          list={list}
          inputMode="decimal"
          placeholder={t("新 IP（可以从节点里选）", "New IP (or pick a node)")}
          aria-label={t(`${name} 的新 IP`, `New IP for ${name}`)}
        />
        <datalist id={list}>
          {choices.map((c) => (
            <option key={c.ip} value={c.ip}>
              {c.standby ? t(`${c.name}（备用机）`, `${c.name} (standby)`) : c.name}
            </option>
          ))}
        </datalist>
        <button type="button" className="btn btn-sm btn-warning" disabled={pending || !ip.trim()} onClick={() => submit()}>
          {pending ? t("切换中…", "Switching…") : t("切换", "Switch")}
        </button>
        {/* 被墙时最常用的一步：直接切到备用机 */}
        {choices
          .filter((c) => c.standby)
          .map((c) => (
            <button key={c.ip} type="button" className="btn btn-sm btn-error btn-soft" disabled={pending} onClick={() => submit(c.ip)}>
              {t(`切到备用机「${c.name}」`, `Switch to standby "${c.name}"`)}
            </button>
          ))}
      </div>
      {result?.error && (
        <div role="alert" className="alert alert-error alert-soft text-sm">
          {result.error}
        </div>
      )}
      {result?.ok && (
        <div role="alert" className="alert alert-success alert-soft text-sm">
          {result.ok}
        </div>
      )}
    </div>
  );
}
