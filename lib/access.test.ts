import { describe, expect, it } from "vitest";
import { verifyAccessJwt } from "./access";

const cfg = { teamDomain: "team.cloudflareaccess.com", aud: "aud-123" };
const enc = (o: object | Uint8Array) =>
  btoa(String.fromCharCode(...(o instanceof Uint8Array ? o : new TextEncoder().encode(JSON.stringify(o)))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// 自己生成一对 RSA 密钥，冒充 Access 签发 JWT
async function setup() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  const sign = async (claims: object, kid = "k1") => {
    const head = `${enc({ alg: "RS256", kid })}.${enc(claims)}`;
    const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(head)));
    return `${head}.${enc(sig)}`;
  };
  return { sign, fetchKeys: async () => [jwk] };
}

const good = { aud: ["aud-123"], iss: "https://team.cloudflareaccess.com", exp: 2000, email: "Boss@Example.com" };

describe("Cloudflare Access JWT", () => {
  it("签名、aud、iss、有效期都对才通过，邮箱转小写", async () => {
    const { sign, fetchKeys } = await setup();
    expect(await verifyAccessJwt(await sign(good), cfg, 1000, fetchKeys)).toBe("boss@example.com");
  });
  it("aud、iss 不对，或者过期了，都不通过", async () => {
    const { sign, fetchKeys } = await setup();
    expect(await verifyAccessJwt(await sign(good), cfg, 1000, fetchKeys)).toBe("boss@example.com");
    expect(await verifyAccessJwt(await sign({ ...good, aud: ["other"] }), cfg, 1000, fetchKeys)).toBeNull();
    expect(await verifyAccessJwt(await sign({ ...good, iss: "https://evil.example.com" }), cfg, 1000, fetchKeys)).toBeNull();
    expect(await verifyAccessJwt(await sign(good), cfg, 3000, fetchKeys)).toBeNull();
  });
  it("别的密钥签的、篡改过的、乱写的都不通过", async () => {
    const a = await setup();
    const b = await setup();
    // b 签的，拿 a 的公钥验（b 自己的公钥是能验过的）
    expect(await verifyAccessJwt(await b.sign(good), cfg, 1000, b.fetchKeys)).toBe("boss@example.com");
    expect(await verifyAccessJwt(await b.sign(good), cfg, 1000, a.fetchKeys)).toBeNull();
    const t = await a.sign(good);
    const [h, , s] = t.split(".");
    expect(await verifyAccessJwt(`${h}.${enc({ ...good, email: "hacker@example.com" })}.${s}`, cfg, 1000, a.fetchKeys)).toBeNull();
    expect(await verifyAccessJwt("not-a-jwt", cfg, 1000, a.fetchKeys)).toBeNull();
  });
});
