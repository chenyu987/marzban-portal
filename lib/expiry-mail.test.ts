import { describe, expect, it } from "vitest";
import { reminderMail } from "./expiry-mail";
import { site } from "@/site.config";

const DAY = 86400;
const now = 1_800_000_000;
const row = (lang: string | null) => ({ marzban_username: "u1", code: "AB12CD34", lang });

describe("reminderMail", () => {
  it("没到期：称呼客人，说天数接着原到期时间往后加", () => {
    const { subject, text } = reminderMail(row("zh"), "高速版", now + 3 * DAY, 3, now);
    expect(subject).toBe(`${site.brand} 订阅 3 天后到期`);
    expect(text.startsWith(`尊敬的 ${site.mailGreetingName ?? site.brand} 用户：`)).toBe(true);
    expect(text).toContain("接着原来的到期时间往后加");
    expect(text).not.toContain("从当日算起");
  });

  it("已到期：续费从当日算起，不能说接着原到期时间加", () => {
    const { subject, text } = reminderMail(row("zh"), "高速版", now - DAY, 0, now);
    expect(subject).toBe(`${site.brand} 订阅已到期`);
    expect(text).toContain("续费后时间从当日算起");
    expect(text).not.toContain("往后加");
  });

  it("结尾写客服邮箱，在关提醒那句前面", () => {
    const { text } = reminderMail(row("zh"), "高速版", now + 3 * DAY, 3, now);
    if (!site.contactEmail) return;
    expect(text).toContain(`有任何疑问，欢迎发邮件给客服：${site.contactEmail}`);
    expect(text.indexOf("客服")).toBeLessThan(text.indexOf("不想收到"));
    expect(text).toContain("续费：https://");
  });

  it("还剩 1 天写明天到期", () => {
    expect(reminderMail(row("zh"), null, now + DAY, 1, now).subject).toBe(`${site.brand} 订阅明天到期`);
  });

  it("英文版同样区分", () => {
    expect(reminderMail(row("en"), null, now - DAY, 0, now).text).toContain("start from the day you renew");
    expect(reminderMail(row("en"), null, now + DAY, 1, now).text).toMatch(/^Dear .+ user,/);
  });
});
