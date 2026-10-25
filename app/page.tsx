import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";

export default async function Home() {
  redirect((await currentCustomer()) ? "/dashboard" : "/login");
}
