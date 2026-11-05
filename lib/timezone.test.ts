import { describe, expect, it } from "vitest";
import { DEFAULT_TZ, resolveTz, tzLabel } from "./timezone";
import { formatDate, formatExpire } from "./format";

describe("时区", () => {
  it("resolveTz：选了用选的，没选 / 跟随设备用浏览器报的，都没有或不合法按北京时间", () => {
    expect(resolveTz("America/Los_Angeles", "Asia/Tokyo")).toBe("America/Los_Angeles");
    expect(resolveTz("auto", "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(resolveTz(undefined, "Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(resolveTz("Not/AZone", "also-bad")).toBe(DEFAULT_TZ);
    expect(resolveTz(null, null)).toBe(DEFAULT_TZ);
  });

  it("formatExpire / formatDate 跟着时区走，不传还是北京时间", () => {
    const t = Date.UTC(2026, 11, 3, 2, 15) / 1000; // 北京 12/03 10:15，洛杉矶 12/02 18:15
    expect(formatExpire(t)).toBe("2026/12/03 10:15");
    expect(formatExpire(t, "zh", "America/Los_Angeles")).toBe("2026/12/02 18:15");
    expect(formatDate(t, "zh", "America/Los_Angeles")).toBe("2026/12/02");
  });

  it("tzLabel：常用的写中文名，别的写 IANA 名", () => {
    expect(tzLabel("America/Los_Angeles")).toBe("美西（洛杉矶 / 西雅图）");
    expect(tzLabel("America/Denver")).toBe("America/Denver");
  });
});
