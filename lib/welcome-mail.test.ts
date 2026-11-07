import { describe, expect, it } from "vitest";
import { newCustomerAlert, welcomeMail } from "./welcome-mail";
import { site } from "@/site.config";

describe("welcomeMail", () => {
  it("没有老订阅：写登录邮箱，引导去选套餐和看教程", () => {
    const { subject, text } = welcomeMail("zh", "a@example.test", 0);
    expect(subject).toContain("注册成功");
    expect(text.startsWith(`尊敬的 ${site.mailGreetingName ?? site.brand} 用户：`)).toBe(true);
    expect(text).toContain("登录邮箱是 a@example.test");
    expect(text).toContain(new URL("/plans", site.siteUrl).toString());
    expect(text).toContain(new URL("/tutorial", site.siteUrl).toString());
    expect(text).not.toContain("自动关联");
  });

  it("绑上了老订阅：告诉客人去「我的订阅」，不叫他再买", () => {
    const { text } = welcomeMail("zh", "a@example.test", 2);
    expect(text).toContain("2 个订阅已经自动关联");
    expect(text).toContain(new URL("/dashboard", site.siteUrl).toString());
    expect(text).not.toContain("/plans");
  });

  it("英文", () => {
    const { subject, text } = welcomeMail("en", "a@example.test", 1);
    expect(subject).toContain("Welcome");
    expect(text).toContain("1 existing subscription has been linked");
  });
});

describe("newCustomerAlert", () => {
  it("标题有微信号和邮箱，正文写推荐人、绑上的订阅、后台链接", () => {
    const { subject, text } = newCustomerAlert({ email: "a@example.test", wechat: "wx1", referrer: "b@example.test", claimed: ["u1", "u2"] });
    expect(subject).toBe("【新客人】wx1 a@example.test");
    expect(text).toContain("推荐人：b@example.test");
    expect(text).toContain("u1、u2");
    if (site.admin.url) expect(text).toContain(`${site.admin.url}/admin/customers?q=a%40example.test`);
  });

  it("没推荐人、没老订阅就不写这两句", () => {
    const { text } = newCustomerAlert({ email: "a@example.test", wechat: "wx1", referrer: null, claimed: [] });
    expect(text).not.toContain("推荐人");
    expect(text).not.toContain("老订阅");
  });
});
