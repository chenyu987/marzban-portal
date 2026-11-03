import { describe, expect, it } from "vitest";
import { parseTheme, themeAttr } from "./theme";

describe("theme", () => {
  it("cookie 里只认 light / dark，别的都当跟随系统", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBe("system");
    expect(parseTheme("blue")).toBe("system");
    expect(parseTheme(undefined)).toBe("system");
  });
  it("对应到 globals.css 的主题名，跟随系统不写", () => {
    expect(themeAttr("light")).toBe("brand");
    expect(themeAttr("dark")).toBe("brand-dark");
    expect(themeAttr("system")).toBeUndefined();
  });
});
