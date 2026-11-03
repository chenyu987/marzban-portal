import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { register } from "../actions";
import AuthForm from "../AuthForm";
import { authAside } from "@/lib/public-site";
import { getT } from "@/lib/lang";

// 推荐链接是 /register?ref=<推荐码>，打开时自动填好
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  if (await currentCustomer()) redirect("/dashboard");
  const { t, lang } = await getT();
  const { ref } = await searchParams;
  return (
    <AuthForm
      aside={authAside(lang)}
      title={t("注册账号", "Create an account")}
      submitLabel={t("注册", "Sign up")}
      action={register}
      passwordAutoComplete="new-password"
      footer={{ text: t("已经有账号？", "Already have an account?"), href: "/login", link: t("登录", "Log in") }}
      referral={{ defaultValue: typeof ref === "string" ? ref.slice(0, 32) : "" }}
    />
  );
}
