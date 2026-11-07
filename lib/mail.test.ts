import { describe, expect, it } from "vitest";
import { mailPayload } from "./mail";

describe("mailPayload", () => {
  it("发给客人：带回复地址，客人点回复到客服邮箱", () => {
    expect(mailPayload("no-reply@x.test", "a@x.test", "s", "t", "support@x.test")).toEqual({
      from: "no-reply@x.test",
      to: ["a@x.test"],
      subject: "s",
      text: "t",
      reply_to: "support@x.test",
    });
  });

  it("发给客服邮箱自己（管理员提醒）：不加回复地址", () => {
    expect(mailPayload("no-reply@x.test", "support@x.test", "s", "t", "support@x.test")).not.toHaveProperty("reply_to");
  });

  it("没配客服邮箱：不加", () => {
    expect(mailPayload("no-reply@x.test", "a@x.test", "s", "t", null)).not.toHaveProperty("reply_to");
  });
});
