import { describe, expect, it } from "vitest";
import { isOverLimit, REGISTER_LIMITS } from "./rate-limit";

describe("isOverLimit", () => {
  const now = 1_000_000;
  it("一小时内不到 3 次可以", () => {
    expect(isOverLimit([now - 100, now - 200], now, REGISTER_LIMITS)).toBe(false);
  });
  it("一小时内已经 3 次就不行", () => {
    expect(isOverLimit([now - 100, now - 200, now - 3000], now, REGISTER_LIMITS)).toBe(true);
  });
  it("一小时以前的不算进小时限额，但算进一天的", () => {
    const old = Array.from({ length: 9 }, (_, i) => now - 4000 - i * 1000);
    expect(isOverLimit(old, now, REGISTER_LIMITS)).toBe(false);
    expect(isOverLimit([...old, now - 5], now, REGISTER_LIMITS)).toBe(true);
  });
  it("一天以前的都不算", () => {
    expect(isOverLimit(Array(20).fill(now - 90_000), now, REGISTER_LIMITS)).toBe(false);
  });
});
