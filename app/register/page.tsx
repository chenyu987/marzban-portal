import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { register } from "../actions";
import AuthForm from "../AuthForm";

// 推荐链接是 /register?ref=<推荐码>，打开时自动填好
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  if (await currentCustomer()) redirect("/dashboard");
  const { ref } = await searchParams;
  return (
    <AuthForm
      title="注册账号"
      submitLabel="注册"
      action={register}
      passwordAutoComplete="new-password"
      footer={{ text: "已经有账号？", href: "/login", link: "登录" }}
      referral={{ defaultValue: typeof ref === "string" ? ref.slice(0, 32) : "" }}
    />
  );
}
