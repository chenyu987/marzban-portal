import { describe, expect, it } from "vitest";
import { lastMonthRange, monthKey, peakRingPct } from "./usage-peak";

describe("上个月最高用量", () => {
  it("monthKey / lastMonthRange 按北京时间算月份", () => {
    // UTC 10/31 17:00 = 北京 11/01 01:00，已经是 11 月
    const t = Date.UTC(2026, 9, 31, 17);
    expect(monthKey(t)).toBe("2026-11");
    const r = lastMonthRange(t);
    expect(r.key).toBe("2026-10");
    expect(r.start.toISOString()).toBe("2026-09-30T16:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-10-31T16:00:00.000Z");
    expect(lastMonthRange(Date.UTC(2026, 0, 15)).key).toBe("2025-12");
  });

  it("peakRingPct：本月已用 ÷ 上个月最高，最多 100%", () => {
    expect(peakRingPct(50, 200)).toBe(25);
    expect(peakRingPct(300, 200)).toBe(100);
    expect(peakRingPct(10, 0)).toBe(0);
  });
});
