import { describe, expect, it } from "vitest";
import { emailError, orderClients, passwordError, wechatError } from "./account";

describe("账号校验", () => {
  it("邮箱", () => {
    expect(emailError("a@b.co")).toBeNull();
    expect(emailError("a@b")).not.toBeNull();
    expect(emailError("")).not.toBeNull();
  });
  it("微信号：字母数字下划线减号，手机号也行", () => {
    expect(wechatError("wx_abc-12")).toBeNull();
    expect(wechatError("13800138000")).toBeNull();
    expect(wechatError("")).toContain("请填微信号");
    expect(wechatError("有中文")).toContain("格式不对");
    expect(wechatError("a b c d e")).toContain("格式不对");
  });
  it("密码至少 8 位", () => {
    expect(passwordError("1234567")).not.toBeNull();
    expect(passwordError("12345678")).toBeNull();
  });
});

describe("常用客户端排最前", () => {
  const list = [{ id: "shadowrocket" as const }, { id: "clash" as const }, { id: "hiddify" as const }];
  it("选了的排最前，其余顺序不变；没选或乱填按原顺序", () => {
    expect(orderClients(list, "hiddify").map((c) => c.id)).toEqual(["hiddify", "shadowrocket", "clash"]);
    expect(orderClients(list, null).map((c) => c.id)).toEqual(["shadowrocket", "clash", "hiddify"]);
    expect(orderClients(list, "evil").map((c) => c.id)).toEqual(["shadowrocket", "clash", "hiddify"]);
  });
});
