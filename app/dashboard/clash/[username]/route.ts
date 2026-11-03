// 「下载 Clash 配置文件」：给 FlClash、ClashX Meta 这类要手动导入文件的客户端用。
// 后台去 Marzban 取 <订阅链接>/clash-meta，加上分流规则（lib/clash.ts），存成 .yaml 下载。
// 文件是下载那一刻的快照，节点有变化要重新下载；能一键导入订阅的客户端还是优先用导入
import { db } from "@/lib/env";
import { requireCustomer } from "@/lib/session";
import { getUser } from "@/lib/marzban";
import { attachmentHeader, withRules } from "@/lib/clash";
import { getT } from "@/lib/lang";
import { site } from "@/site.config";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ username: string }> }) {
  const customer = await requireCustomer();
  const { t } = await getT();
  const { username } = await params;
  // 只能下载自己名下的订阅；不是自己的和不存在的一样回 404，不让人试探别人的用户名
  const mine = await db()
    .prepare("SELECT 1 FROM subscriptions WHERE customer_id = ? AND marzban_username = ?")
    .bind(customer.id, username)
    .first();
  if (!mine) return new Response(t("找不到这个订阅", "Subscription not found"), { status: 404 });

  const failed = () =>
    new Response(t("暂时取不到配置文件，请稍后再试。一直这样的话请联系客服", "Can't get the config file right now. Please try again later or contact support"), {
      status: 502,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  let config: string;
  try {
    const user = await getUser(username);
    const res = await fetch(`${user.subscription_url}/clash-meta`);
    if (!res.ok) {
      console.error(`clash: ${username} 取配置返回 ${res.status}`);
      return failed();
    }
    config = await res.text();
  } catch (e) {
    console.error(`clash: ${username} 取配置出错`, e);
    return failed();
  }

  return new Response(withRules(config), {
    headers: {
      "content-type": "text/yaml; charset=utf-8",
      "content-disposition": attachmentHeader(`${site.importName ?? site.brand}-${username}.yaml`),
      // 里面有连接信息（等于密码），不让浏览器和 Cloudflare 缓存
      "cache-control": "no-store",
    },
  });
}
