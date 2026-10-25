import { getCloudflareContext } from "@opennextjs/cloudflare";

export function env(): CloudflareEnv {
  return getCloudflareContext().env;
}

export function db(): D1Database {
  return env().DB;
}

export const nowSec = () => Math.floor(Date.now() / 1000);
