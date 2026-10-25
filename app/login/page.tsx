import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { login } from "../actions";
import AuthForm from "../AuthForm";

export default async function LoginPage() {
  if (await currentCustomer()) redirect("/dashboard");
  return (
    <AuthForm
      title="登录客户中心"
      submitLabel="登录"
      action={login}
      passwordAutoComplete="current-password"
      footer={{ text: "还没有账号？", href: "/register", link: "注册" }}
      forgotLink
    />
  );
}
