// 网站刚重新部署过、页面还是旧版本时会出的错：旧页面去调新版本里已经没有的 Server Action，或者去拿已经换掉的 JS 文件。
// 这种错重试没用，整页刷新一下就好
export function isStaleDeployError(error: { name?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.name === "UnrecognizedActionError" || error.name === "ChunkLoadError") return true;
  const m = error.message ?? "";
  return /Server Action .* was not found|Failed to find Server Action|Loading chunk .* failed|Failed to fetch dynamically imported module/i.test(m);
}
