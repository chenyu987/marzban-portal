import { describe, expect, it } from "vitest";
import { isStaleDeployError } from "./stale";

describe("页面版本过期的错误", () => {
  it("认得出 Server Action 找不到、JS 文件拿不到", () => {
    expect(isStaleDeployError({ name: "UnrecognizedActionError", message: "x" })).toBe(true);
    expect(isStaleDeployError({ name: "Error", message: 'Server Action "604bf49a" was not found on the server.' })).toBe(true);
    expect(isStaleDeployError({ name: "ChunkLoadError", message: "Loading chunk 255 failed." })).toBe(true);
    expect(isStaleDeployError({ name: "TypeError", message: "Failed to fetch dynamically imported module: /x.js" })).toBe(true);
  });

  it("别的错不算，照常显示出错页", () => {
    expect(isStaleDeployError({ name: "Error", message: "Marzban 连不上" })).toBe(false);
    expect(isStaleDeployError(null)).toBe(false);
  });
});
