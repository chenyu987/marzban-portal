# marzban-portal

A self-service customer portal for [Marzban](https://github.com/Gozargah/Marzban), running on Cloudflare Workers.

给 Marzban 用户用的自助中心：客人注册登录后，绑定自己的订阅，就能看到到期时间、流量，一键导入客户端，扫码或复制订阅链接，自己重置泄露的链接，还附带各平台的安装教程。

- Next.js 15，通过 [OpenNext](https://opennext.js.org/cloudflare) 部署到 Cloudflare Workers
- 数据库用 Cloudflare D1，只有后端访问，浏览器拿不到 Marzban 管理员凭据
- 界面用 Tailwind CSS + DaisyUI，适配手机
- 打包后压缩体积约 870 KB，Workers 免费版就能跑

## 功能

- 邮箱 + 密码注册登录（PBKDF2 哈希，会话存在 D1），有登录失败次数限制
- 粘贴已有的订阅链接，绑定到账号。后端只取链接里的 token，不会去请求客人给的域名
- 订阅卡片：状态、到期时间、剩余时间、流量进度和重置周期
- 一键导入 Shadowrocket、Clash Verge、Hiddify；二维码在浏览器本地生成；复制链接；重置订阅链接
- 安装教程：iPhone、Mac、Windows、安卓分页，按访问设备自动切到对应的那页

## 目录

| 位置 | 内容 |
|---|---|
| `site.config.ts` | 站点配置：品牌名、下载地址、设备限制说明。模板是 `site.config.example.ts` |
| `wrangler.jsonc` | Cloudflare 部署配置。模板是 `wrangler.example.jsonc` |
| `app/` | 页面和表单提交（Server Actions） |
| `lib/marzban.ts` | Marzban API 客户端，只在服务端运行 |
| `lib/session.ts`、`lib/password.ts` | 登录会话、密码哈希 |
| `migrations/` | D1 数据库结构 |
| `dev/mock-marzban.mjs` | 本地开发用的假 Marzban，接口格式照 Marzban v0.8.4 |

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
```

开两个终端，一个跑假 Marzban，一个跑 portal：

```bash
npm run mock
```

```bash
npm run dev
```

打开 http://localhost:3000。假 Marzban 启动时会在终端打印几个测试用户的订阅链接，注册后粘贴进去就能测试绑定。

单元测试：

```bash
npm test
```

想在真实的 Workers 运行环境里测打包结果，运行 `npm run preview`，然后打开 http://localhost:8787。

## 部署

1. 按 `site.config.example.ts` 和 `wrangler.example.jsonc` 改好 `site.config.ts` 和 `wrangler.jsonc`
2. `npx wrangler login`
3. `npx wrangler d1 create marzban-portal`，把返回的 `database_id` 填进 `wrangler.jsonc`
4. `npm run db:migrate:remote`
5. 在 Marzban 上给 portal 单独建一个管理员：`marzban cli admin create --sudo`。要 sudo，是因为非 sudo 管理员只能看到自己建的用户
6. `npx wrangler secret put MARZBAN_USERNAME`，然后 `npx wrangler secret put MARZBAN_PASSWORD`
7. `npm run deploy`

`*.workers.dev` 这个默认地址在一些地区访问不了，正式使用建议绑定自己的域名。

## 已知限制

- 三个一键导入的链接格式还没在真机上逐一验证
- 还没有忘记密码和邮箱验证
