import { describe, expect, it } from "vitest";
import { httpsRedirect } from "./https-redirect";

describe("httpsRedirect", () => {
  it("把 http 页面跳到同一地址的 https，路径和参数不丢", () => {
    const res = httpsRedirect(new Request("http://example.com/login?ref=ABC"));
    expect(res?.status).toBe(308);
    expect(res?.headers.get("location")).toBe("https://example.com/login?ref=ABC");
  });

  it("地址是 https 但访客走的 http（x-forwarded-proto）时也跳", () => {
    const req = new Request("https://example.com/login", { headers: { "x-forwarded-proto": "http" } });
    expect(httpsRedirect(req)?.headers.get("location")).toBe("https://example.com/login");
  });

  it("已经是 https 不跳", () => {
    expect(httpsRedirect(new Request("https://example.com/login"))).toBeNull();
  });

  it("本地开发的 http 不跳", () => {
    expect(httpsRedirect(new Request("http://localhost:3000/login"))).toBeNull();
    expect(httpsRedirect(new Request("http://127.0.0.1:8787/login"))).toBeNull();
  });
});
