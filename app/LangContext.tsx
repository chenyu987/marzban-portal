"use client";

import { createContext, useContext } from "react";
import { makeT, type Lang } from "@/lib/i18n";

// 客人选的语言，由根布局从 cookie 读出来传进来
const LangContext = createContext<Lang>("zh");

export function LangProvider({ value, children }: { value: Lang; children: React.ReactNode }) {
  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export const useLang = (): Lang => useContext(LangContext);

// const t = useT()；t("中文", "English")
export const useT = () => makeT(useLang());
