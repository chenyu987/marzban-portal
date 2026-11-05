// 只在服务器上用：这次请求按哪个时区显示时间（见 lib/timezone.ts）
import { cookies } from "next/headers";
import { TZ_AUTO_COOKIE, TZ_COOKIE, resolveTz } from "./timezone";

export async function getTz(): Promise<string> {
  const c = await cookies();
  return resolveTz(c.get(TZ_COOKIE)?.value, c.get(TZ_AUTO_COOKIE)?.value);
}
