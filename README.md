# factor-based-strategies-frontend

[factor-based-strategies](https://github.com/shjunz/factor-based-strategies) 后端的网页界面：选择 Sharadar 的 product、table 和过滤条件，发起下载，查看任务进度和已下载的文件。

技术栈：Vite + React + TypeScript，请求用原生 `fetch`，样式是纯 CSS，没有引入 UI 库、路由或状态管理库。

## 目录结构

```
src/
├── main.tsx              # 入口，把 <App /> 挂到 index.html 的 #root
├── App.tsx               # 页面骨架：加载表和任务、轮询进行中的任务、"后端连不上"提示
├── App.css
├── filters.ts            # 过滤条件输入 → 请求体里 filters 的转换
├── format.ts             # 字节、时间格式化
├── api/
│   ├── schema.d.ts       # 由 npm run gen:api 从后端 /openapi.json 生成，不要手改
│   ├── client.ts         # fetch 封装和错误解析（ApiError）
│   └── index.ts          # 每个后端接口一个函数，以及从 schema.d.ts 取出的类型
└── components/
    ├── DownloadForm.tsx  # 下载表单
    ├── FilterInput.tsx   # 单个过滤条件的输入（日期列为起止日期）
    ├── JobList.tsx       # 下载任务列表
    └── FileList.tsx      # 已下载文件列表
deploy/
├── nginx.conf            # EC2 上的 nginx 配置
└── fbs-api.service       # EC2 上让后端常驻的 systemd unit
```

组件里不出现 URL，所有请求都通过 `src/api/index.ts` 发出，路径一律是相对的 `/api/...`。

## 本地开发

需要 Node.js 20.19+ 或 22.12+。

1. 在**后端仓库**里启动后端：

   ```bash
   make install && make env   # 第一次需要；之后在 .env 里填 NASDAQ_DATA_LINK_API_KEY
   make api                   # http://127.0.0.1:8000，接口文档在 /docs
   ```

2. 在本仓库启动前端：

   ```bash
   npm install
   npm run dev                # 打开 http://localhost:5173
   ```

后端没有配置 CORS，所以浏览器不能直接请求 8000 端口。页面只请求同源的 `/api/...`，由 Vite 开发服务器转发给后端（见 `vite.config.ts` 的 `server.proxy`）；EC2 上则由 nginx 转发。

### `VITE_API_TARGET`

开发时 `/api` 转发到哪里，默认是 `http://127.0.0.1:8000`。后端在别的端口或别的机器上时：

```bash
cp .env.example .env.local     # 改 .env.local 里的 VITE_API_TARGET
# 或者只对这一次生效：
VITE_API_TARGET=http://192.168.1.10:8000 npm run dev
```

它只影响 `npm run dev`；`npm run build` 的产物里没有后端地址，转发由 nginx 负责。`.env*` 已被 git 忽略（`.env.example` 除外）。

### `npm run gen:api`

从正在运行的后端（`http://127.0.0.1:8000/openapi.json`）生成 `src/api/schema.d.ts`。**后端接口或请求/响应模型有改动时**，先在后端仓库 `make api`，再在这里运行它，然后执行 `npm run build` 看看前端哪里需要跟着改，最后把新的 `schema.d.ts` 一起提交。

`schema.d.ts` 提交在 git 里，所以在 EC2 上构建时不需要后端已经启动。

> 目前 `schema.d.ts` 里 `TableSchema.types`（列名 → INDICATORS 的 unittype）是手工补上的，后端还没有这个字段。后端加上之后重跑 `gen:api` 会得到同样的内容。在那之前，页面对当前后端照样可用，只是所有过滤条件都显示为文本框，日期列不会显示成起止日期。

### 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发服务器，改代码自动刷新 |
| `npm run build` | 类型检查（`tsc -b`）并打包到 `dist/` |
| `npm run preview` | 本地预览 `dist/`（不带 `/api` 代理，只用来看打包结果） |
| `npm run lint` | oxlint 检查 |
| `npm run gen:api` | 重新生成 `src/api/schema.d.ts` |

## 在 EC2 上部署

下面以 Amazon Linux 2023、用户 `ec2-user`、前后端两个仓库都放在 `/home/ec2-user/` 下为例。用 Ubuntu 的话，把 `dnf` 换成 `apt`、`ec2-user` 换成 `ubuntu`，nginx 配置放在 `/etc/nginx/sites-available/` 并软链到 `sites-enabled/`。

```
浏览器 ──80/443──▶ nginx ─┬─ /        → dist/ 静态文件
                          └─ /api/... → 127.0.0.1:8000（uvicorn，systemd 常驻）
```

### 1. 安全组

入站规则只开：

- 22（SSH）：来源限定为你自己的 IP
- 80 / 443（HTTP / HTTPS）：**后端没有鉴权**，任何能打开页面的人都能发起下载、消耗你的 Sharadar 额度。最好把来源限定为你自己的 IP（`x.x.x.x/32`）；需要从不固定的地方访问时，开 `0.0.0.0/0`，但一定要配置下面第 6 步的 basic auth

不要开放 8000 端口：后端只监听 127.0.0.1，由 nginx 在本机转发。

### 2. 安装 Node、nginx、git、Python

```bash
sudo dnf install -y nginx git python3.12
sudo systemctl enable --now nginx

# Node 用 nvm 装（只用于构建前端）
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 22
node -v
```

### 3. 构建前端

```bash
cd ~
git clone <本仓库地址> factor-based-strategies-frontend
cd factor-based-strategies-frontend
npm ci
npm run build          # 生成 dist/
```

### 4. 部署后端并用 systemd 常驻

```bash
cd ~
git clone https://github.com/shjunz/factor-based-strategies.git
cd factor-based-strategies
make install && make env
vi .env        # 填 NASDAQ_DATA_LINK_API_KEY

sudo cp ~/factor-based-strategies-frontend/deploy/fbs-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fbs-api
systemctl status fbs-api
curl http://127.0.0.1:8000/api/tables     # 有 JSON 返回就说明后端正常
journalctl -u fbs-api -f                  # 查看日志
```

unit 里运行的是：

```
.venv/bin/uvicorn fbs.api.main:app --app-dir src --env-file .env --host 127.0.0.1 --port 8000
```

工作目录是后端仓库根目录。不要用 `make api-prod`，它监听 0.0.0.0。也不要加 `--workers`：下载任务保存在进程内存里，多个进程之间互相看不到对方的任务。

### 5. 配置 nginx

```bash
sudo cp deploy/nginx.conf /etc/nginx/conf.d/fbs.conf
# Amazon Linux 的家目录默认是 700，nginx 用户进不去，读不到 dist/
chmod o+x /home/ec2-user
sudo nginx -t && sudo systemctl reload nginx
```

浏览器打开 `http://<EC2 公网 IP>/` 即可。

`deploy/nginx.conf` 做了三件事：

- `root` 指向 `dist/`
- `location /api/` 用 `proxy_pass http://127.0.0.1:8000` 转发给后端（端口后面不加 `/`，转发时保留 `/api` 前缀）
- `try_files $uri $uri/ /index.html` 让所有其他路径回退到 `index.html`

如果页面显示 502：检查 `systemctl status fbs-api`。如果系统开启了 SELinux（`getenforce` 显示 `Enforcing`），还需要执行 `sudo setsebool -P httpd_can_network_connect 1`，允许 nginx 访问 8000 端口。

### 6. （推荐）basic auth

```bash
sudo dnf install -y httpd-tools                # Ubuntu: sudo apt install apache2-utils
sudo htpasswd -c /etc/nginx/.htpasswd yourname # 按提示输入密码
```

取消 `/etc/nginx/conf.d/fbs.conf` 里 `auth_basic` 两行的注释，然后执行 `sudo nginx -t && sudo systemctl reload nginx`。basic auth 的密码是明文传输的，公网访问时建议同时配置 HTTPS：要么有域名，用 `certbot --nginx`；要么继续用安全组限制来源 IP。

### 7. 更新

```bash
# 前端
cd ~/factor-based-strategies-frontend && git pull && npm ci && npm run build   # nginx 不用重启

# 后端
cd ~/factor-based-strategies && git pull && .venv/bin/pip install -e . && sudo systemctl restart fbs-api
```

后端重启后，任务列表会被清空。页面上原来进行中的任务会显示为"已丢失"，已经下载好的文件不受影响。

## 已知限制

- 后端没有下载文件内容的接口，页面只显示文件在服务器上的路径（相对后端仓库的 `data/` 目录）和大小
- 任务只保存在后端内存里，后端重启后就没有了
- 过滤值都按字符串发送；只有日期列支持起止范围，数值列不支持 `gt`/`lt` 范围过滤
