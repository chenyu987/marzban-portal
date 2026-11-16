import { describe, expect, it } from "vitest";
import { pushBody, pushKeys } from "./push";

describe("pushKeys", () => {
  it("逗号（中英文都行）或空格隔开的几个 SendKey，去重，格式不对的跳过", () => {
    expect(pushKeys("SCTabc1234567890, SCTdef1234567890，SCTabc1234567890 bad-key!")).toEqual(["SCTabc1234567890", "SCTdef1234567890"]);
    expect(pushKeys("")).toEqual([]);
    expect(pushKeys(undefined)).toEqual([]);
  });
});

describe("pushBody", () => {
  it("标题超过 32 个字截断，正文单个换行变成分段", () => {
    const b = pushBody("【疑似被墙】东京、大阪、首尔、西雅图、洛杉矶、湾区（家里-联通，测试很长的名字）", "第一行\n第二行\n\n第三段");
    expect(b.title.length).toBe(32);
    expect(b.title.endsWith("…")).toBe(true);
    expect(b.desp).toBe("第一行\n\n第二行\n\n第三段");
  });
  it("短标题原样", () => {
    expect(pushBody("【已恢复】东京（家里-联通）", "x").title).toBe("【已恢复】东京（家里-联通）");
  });
});
