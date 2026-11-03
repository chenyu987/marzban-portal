// 微信内置浏览器的 User-Agent 里带 MicroMessenger（企业微信也带，一起算）
export const isWechat = (userAgent: string) => /MicroMessenger/i.test(userAgent);
