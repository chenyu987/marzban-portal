import { describe, expect, it } from "vitest";
import { langFromAcceptLanguage, makeT, parseLang, pick } from "./i18n";

describe("langFromAcceptLanguage", () => {
  it("首选中文的看中文", () => {
    expect(langFromAcceptLanguage("zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(langFromAcceptLanguage("zh-TW")).toBe("zh");
  });
  it("首选别的语言的看英文", () => {
    expect(langFromAcceptLanguage("en-US,en;q=0.9,zh-CN;q=0.8")).toBe("en");
    expect(langFromAcceptLanguage("fr-FR,fr;q=0.9")).toBe("en");
  });
  it("读不到就中文", () => {
    expect(langFromAcceptLanguage(null)).toBe("zh");
    expect(langFromAcceptLanguage("")).toBe("zh");
    expect(langFromAcceptLanguage("*")).toBe("zh");
  });
});

describe("parseLang / makeT / pick", () => {
  it("只认 en，别的都是中文", () => {
    expect(parseLang("en")).toBe("en");
    expect(parseLang("fr")).toBe("zh");
    expect(parseLang(undefined)).toBe("zh");
  });
  it("按语言选文案", () => {
    expect(makeT("en")("中", "En")).toBe("En");
    expect(pick({ zh: "中", en: "En" }, "zh")).toBe("中");
    expect(pick("只有中文", "en")).toBe("只有中文");
  });
});
