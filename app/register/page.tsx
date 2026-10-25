import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { register } from "../actions";
import AuthForm from "../AuthForm";

export default async function RegisterPage() {
  if (await currentCustomer()) redirect("/dashboard");
  return (
    <AuthForm
      title="注册账号"
      submitLabel="注册"
      action={register}
      passwordAutoComplete="new-password"
      footer={{ text: "已经有账号？", href: "/login", link: "登录" }}
    />
  );
}
