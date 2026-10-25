// 校验 Cloudflare Access 给后台请求加的 JWT（请求头 Cf-Access-Jwt-Assertion）。
// 只看页面上有没有被 Access 挡住不够：有人可能绕过 Access 直接访问 Worker，所以后端每个请求都要自己验签名。
// 做法照 Cloudflare 文档：用团队的公钥（https://<团队域名>/cdn-cgi/access/certs）验 RS256 签名，再看 aud、iss、过期时间

export type AccessConfig = { teamDomain: string; aud: string };
type Jwk = JsonWebKey & { kid: string };
export type FetchKeys = (teamDomain: string) => Promise<Jwk[]>;

const b64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const json = (s: string) => JSON.parse(new TextDecoder().decode(b64url(s)));

// 公钥缓存一小时；遇到没见过的 kid（Cloudflare 轮换了密钥）就重新拉
let cache: { teamDomain: string; keys: Jwk[]; at: number } | null = null;
const fetchCerts: FetchKeys = async (teamDomain) => {
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`拉 Access 公钥失败：${res.status}`);
  return ((await res.json()) as { keys: Jwk[] }).keys;
};

async function keyFor(kid: string, teamDomain: string, fetchKeys: FetchKeys): Promise<Jwk | undefined> {
  // 测试会传自己的 fetchKeys，不走缓存
  if (fetchKeys !== fetchCerts) return (await fetchKeys(teamDomain)).find((k) => k.kid === kid);
  const fresh = cache && cache.teamDomain === teamDomain && Date.now() - cache.at < 3600_000;
  let key = fresh ? cache!.keys.find((k) => k.kid === kid) : undefined;
  if (!key) {
    cache = { teamDomain, keys: await fetchKeys(teamDomain), at: Date.now() };
    key = cache.keys.find((k) => k.kid === kid);
  }
  return key;
}

// 验证通过返回 JWT 里的邮箱（小写），不通过返回 null
export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  nowSec = Date.now() / 1000,
  fetchKeys: FetchKeys = fetchCerts,
): Promise<string | null> {
  try {
    const [h, p, sig] = token.split(".");
    if (!h || !p || !sig) return null;
    const header = json(h);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return null;
    const jwk = await keyFor(header.kid, cfg.teamDomain, fetchKeys);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;

    const claims = json(p);
    const aud: string[] = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.includes(cfg.aud)) return null;
    if (claims.iss !== `https://${cfg.teamDomain}`) return null;
    if (typeof claims.exp !== "number" || claims.exp <= nowSec) return null;
    if (typeof claims.nbf === "number" && claims.nbf > nowSec + 60) return null;
    return typeof claims.email === "string" ? claims.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
