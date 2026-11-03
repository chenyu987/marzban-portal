// 明文 http 打开的页面要先跳到 https：登录 cookie 带 Secure，http 页面上浏览器会丢掉它，
// 表现是密码对了还被弹回登录页；密码本身也不该明文传。微信把不带 https:// 的网址当 http 打开，点「在浏览器打开」后仍是 http。
// 用 308 不用 301：表单 POST 跳过去还是 POST。本地开发是 http://localhost，不跳。
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

export function httpsRedirect(request: Request): Response | null {
  const url = new URL(request.url);
  if (LOCAL_HOST.test(url.hostname)) return null;
  const isHttp = url.protocol === "http:" || request.headers.get("x-forwarded-proto") === "http";
  if (!isHttp) return null;
  url.protocol = "https:";
  return new Response(null, { status: 308, headers: { location: url.toString() } });
}
