import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { canSendMail } from "@/lib/mail";
import ForgotForm from "./ForgotForm";
import { turnstileSiteKey } from "@/lib/turnstile";

export default async function ForgotPage() {
  if (await currentCustomer()) redirect("/dashboard");
  return <ForgotForm canSend={canSendMail()} turnstileSiteKey={turnstileSiteKey()} />;
}
