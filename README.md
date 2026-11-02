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
- 推荐码：每个账号注册时自动生成，可以复制推荐码或推荐链接（`/register?ref=<推荐码>`，打开就自动填好）发给朋友；注册时选填，填错会提示；推荐人在订阅页看到被推荐的人（邮箱打码）和注册日期
- 推荐奖励：被推荐人每付一笔款，推荐人拿这笔金额的 10%，记进余额；订阅页显示余额和奖励明细。奖励由数据库触发器在订单变成已付款时自动发。线下收款可以用 `npm run payment:record -- <邮箱> <金额（元）> [--note 备注] [--remote]` 记账；加 `--plan <套餐>` 会先在 Marzban 新建用户（用客人的微信号命名，没有微信号就是 `c<客人id>_<序号>`，自动绑到客人名下）或用 `--renew <用户名>` 续期，再记账。套餐在 `site.config.ts` 的 `plans` 里配，命令行连线上 Marzban 用的管理员账号放在 `.remote.vars`（模板 `.remote.vars.example`）
- 套餐页（`/plans`）：按 `site.config.ts` 的 `plans` 显示价格；客人输入兑换码后自动在 Marzban 新开订阅或给已有订阅续期，同时记一笔订单（按套餐价，触发推荐奖励）。兑换码用 `npm run codes:create -- <套餐> [数量] [--note 备注] [--remote]` 生成
- 用余额买套餐和抵扣：下单时默认勾选「用余额抵扣」。余额够付全款就直接在 Marzban 开通或续期，不用管理员（扣余额、开通、记账一步完成；Marzban 出错时确认没改就退回余额）；不够就抵扣一部分，剩下的转账，单子取消时抵扣的余额退回。余额只能抵扣套餐费用。用余额付的部分也算付款，会给推荐人发奖励
- 套餐页下单：在 `site.config.ts` 的 `payments` 里填上收款码，套餐页的每个价格就变成下单按钮。客人下单后看到金额、订单号和收款码，转账时备注订单号，付完点「我已付款」（选付款方式、填付款人，记下时间方便对账），马上在 Marzban 开通或续期并记账（触发推荐奖励）。管理员之后在后台「已开通、待对账」里对账：找到钱点「确认到账」，找不到点「没收到钱，收回」（新开的停用，续期的扣回天数）。自动开通失败的单留给管理员在后台或用 `npm run orders -- confirm <订单号> [--remote]` 开通。`npm run orders -- list [金额]` 看待处理的单（客人说已付的排前面），`cancel` 取消。客人可以取消自己还没点「我已付款」的单，同时最多挂 3 张
- 到期提醒：订阅剩 7 天以内或已经到期时，订阅页在这个订阅上显示提醒和「续费」按钮，点了到套餐页、已经选好给这个订阅续期（`/plans?renew=<用户名>`）；没到期的订阅有个「提前续费」链接
- 忘记密码：登录页「忘记密码？」→ 输入邮箱，收到带重置链接的邮件（1 小时内有效，只能用一次），设好新密码后所有设备的登录都会退出。发信用 Resend，配了 `RESEND_API_KEY` 和 `MAIL_FROM` 才会发，没配时页面让客人联系管理员；管理员可以用 `npm run password:reset-link -- <邮箱> [--remote]` 生成 24 小时有效的链接发给客人。链接里的网址用 `site.config.ts` 的 `siteUrl`
- 管理后台（`/admin`）：前面挡一层 Cloudflare Access，后端每个请求都校验 Access 的 JWT（`lib/access.ts`），邮箱要在 `site.config.ts` 的 `admin.emails` 里；没配 Access 时后台整个返回 404。管理员账号和客人分开，只能用 `npm run admin:create -- <邮箱> [--remote]` 建，邮箱要和 Access 登录的一样。现在能做的：在网页上确认 / 取消客人的转账订单（逻辑和 `npm run orders` 一样）；客人列表和详情（订阅、订单、余额明细、推荐关系），加减余额（必须写原因）、生成重置密码链接、把 Marzban 上已有的用户绑给客人；生成兑换码（看谁用了、作废没用过的）；看操作日志（按人、按操作筛）。所有操作记在 `admin_logs`。本地开发在 `.dev.vars` 设 `ADMIN_DEV_NO_ACCESS=1` 跳过 Access（只认 localhost）
- 安装教程：iPhone、Mac、Windows、安卓分页，按访问设备自动切到对应的那页

## 目录

| 位置 | 内容 |
|---|---|
| `site.config.ts` | 站点配置：品牌名、下载地址、设备限制说明。模板是 `site.config.example.ts` |
| `wrangler.jsonc` | Cloudflare 部署配置。模板是 `wrangler.example.jsonc` |
| `app/` | 页面和表单提交（Server Actions） |
| `lib/marzban.ts` | Marzban API 客户端，只在服务端运行 |
| `lib/session.ts`、`lib/password.ts` | 登录会话、密码哈希 |
| `lib/balance.ts` | 余额和推荐奖励明细的查询 |
| `scripts/record-payment.mjs` | 管理员在命令行记一笔付款，可以顺便在 Marzban 开通或续期 |
| `app/plans/` | 套餐页和兑换码表单 |
| `scripts/create-codes.mjs` | 管理员生成兑换码 |
| `app/admin/`、`lib/admin.ts`、`lib/access.ts`、`lib/admin-orders.ts` | 管理后台：页面、身份检查、Access JWT 校验、确认订单 |
| `scripts/admin-create.mjs` | 建管理员账号、改管理员密码 |
| `scripts/reset-link.mjs` | 管理员给客人生成重置密码的链接 |
| `lib/mail.ts`、`lib/reset.ts` | 发邮件、重置密码链接 |
| `scripts/orders.mjs` | 管理员查看、确认、取消客人在套餐页下的单 |
| `scripts/admin.mjs` | 命令行脚本共用的读写 D1、连 Marzban |
| `lib/plans.ts` | 套餐怎么换算成 Marzban 用户的到期、流量和 `ip=N` 备注 |
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

端到端测试：开一个真浏览器，把注册、下单、管理员确认、续费提醒、忘记密码这条主流程自动点一遍（会自动起假 Marzban 和开发服务器，只能连本地）。第一次要先装浏览器：`npx playwright install chromium`。

```bash
npm run e2e
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
- 还没有邮箱验证
