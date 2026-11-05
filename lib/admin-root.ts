// 后台域名前面挡着 Cloudflare Access，过了 Access 的请求会带 cf-access-jwt-assertion 头。
// 打开后台域名的根目录直接跳到 /admin。放在 Worker 最外层做，不进 Next.js：
// 在页面里 redirect() 时，浏览器有时拿到的是给页面内部跳转用的数据（不是网页），手机上表现为白屏、下载 document.txt。
// 这里只管跳转，权限仍由 /admin 自己逐个请求校验 JWT。
export function adminRootRedirect(request: Request): Response | null {
  if (!request.headers.get("cf-access-jwt-assertion")) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  const url = new URL(request.url);
  if (url.pathname !== "/") return null;
  return new Response(null, { status: 302, headers: { location: "/admin", "cache-control": "no-store" } });
}
