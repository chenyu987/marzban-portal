import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { canSendMail } from "@/lib/mail";
import ForgotForm from "./ForgotForm";

export default async function ForgotPage() {
  if (await currentCustomer()) redirect("/dashboard");
  return <ForgotForm canSend={canSendMail()} />;
}
