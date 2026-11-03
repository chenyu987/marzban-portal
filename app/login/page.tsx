import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { login } from "../actions";
import AuthForm from "../AuthForm";
import { authAside } from "@/lib/public-site";
import { getT } from "@/lib/lang";

export default async function LoginPage() {
  if (await currentCustomer()) redirect("/dashboard");
  const { t, lang } = await getT();
  return (
    <AuthForm
      aside={authAside(lang)}
      title={t("登录客户中心", "Log in")}
      submitLabel={t("登录", "Log in")}
      action={login}
      passwordAutoComplete="current-password"
      footer={{ text: t("还没有账号？", "No account yet?"), href: "/register", link: t("注册", "Sign up") }}
      forgotLink
    />
  );
}
