import { describe, expect, it } from "vitest";
import { adminRootRedirect } from "./admin-root";

const access = { "cf-access-jwt-assertion": "x.y.z" };

describe("adminRootRedirect", () => {
  it("过了 Access 打开根目录：跳到 /admin，不缓存", () => {
    const res = adminRootRedirect(new Request("https://admin.example.com/", { headers: access }));
    expect(res?.status).toBe(302);
    expect(res?.headers.get("location")).toBe("/admin");
    expect(res?.headers.get("cache-control")).toBe("no-store");
  });

  it("页面内部跳转的请求（带 rsc 头）也直接跳", () => {
    const req = new Request("https://admin.example.com/?_rsc=abc", { headers: { ...access, rsc: "1" } });
    expect(adminRootRedirect(req)?.headers.get("location")).toBe("/admin");
  });

  it("客人网站（没有 Access 头）不跳", () => {
    expect(adminRootRedirect(new Request("https://example.com/"))).toBeNull();
  });

  it("后台域名的其他路径、POST 不跳", () => {
    expect(adminRootRedirect(new Request("https://admin.example.com/admin", { headers: access }))).toBeNull();
    expect(adminRootRedirect(new Request("https://admin.example.com/", { method: "POST", headers: access }))).toBeNull();
  });
});
