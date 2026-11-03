// 深浅色：客人在「账户」页选，记在 cookie 里，服务器渲染时就写到 <html data-theme>，打开页面不会先闪一下别的颜色。
// 没选过就是「跟随系统」：不写 data-theme，按系统的深色模式（globals.css 里 brand-dark 的 prefersdark）
export type Theme = "system" | "light" | "dark";
export const THEME_COOKIE = "theme";

export function parseTheme(v: string | null | undefined): Theme {
  return v === "light" || v === "dark" ? v : "system";
}

// <html data-theme> 的值，对应 globals.css 里的两套主题；跟随系统时不写
export function themeAttr(theme: Theme): string | undefined {
  return theme === "light" ? "brand" : theme === "dark" ? "brand-dark" : undefined;
}
