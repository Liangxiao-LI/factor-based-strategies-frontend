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

### 1. 在 AWS Console 创建实例

1. 登录 AWS Console，先在右上角选好区域（Region），例如 `Asia Pacific (Tokyo)`。实例、密钥对、安全组都按区域区分，之后要在同一个区域里找它们
2. 顶部搜索框输入 `EC2`，进入 EC2 控制台，点橙色的 **Launch instance**
3. **Name and tags**：填一个名字，例如 `fbs`
4. **Application and OS Images (AMI)**：选 **Amazon Linux**，下拉框选 **Amazon Linux 2023 AMI**，架构选 **64-bit (x86)**
5. **Instance type**：选 `t3.small`（2 GiB 内存）。`t3.micro` / `t2.micro`（1 GiB）在免费套餐内，但 `npm ci` 和 `npm run build` 可能因为内存不够被杀掉，要用的话先加 swap：

   ```bash
   sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
   sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   ```

6. **Key pair (login)**：点 **Create new key pair**，名字填 `fbs-key`，类型 **RSA**，格式 **.pem**，点 **Create key pair**，浏览器会下载 `fbs-key.pem`。这个文件只能下载这一次，丢了就只能换密钥对
7. **Network settings**：点右上角 **Edit**
   - **VPC** 用默认的，**Auto-assign public IP** 选 **Enable**
   - **Firewall (security groups)** 选 **Create security group**，名字填 `fbs-sg`
   - 默认已有一条 `ssh` 规则：**Source type** 改成 **My IP**
   - 点 **Add security group rule**，**Type** 选 `HTTP`（80），**Source type** 选 **My IP**
   - 再加一条 `HTTPS`（443），同样选 **My IP**（以后配 HTTPS 时用）

   **后端没有鉴权**，任何能打开页面的人都能发起下载、消耗你的 Sharadar 额度，所以 80/443 最好只对自己的 IP 开。需要从不固定的地方访问时可以改成 `Anywhere`（`0.0.0.0/0`），但一定要配置下面第 6 步的 basic auth。**不要开 8000 端口**：后端只监听 127.0.0.1，由 nginx 在本机转发
8. **Configure storage**：改成 `20` GiB、`gp3`。下载的数据都放在后端仓库的 `data/` 目录里，默认的 8 GiB 很快就会用完
9. 右侧点 **Launch instance**，然后点 **View all instances**。等 **Instance state** 变成 `Running`、**Status check** 显示所有检查都通过
10. 选中实例，在下方 **Details** 里复制 **Public IPv4 address**

    这个公网 IP 在实例 stop 再 start 之后会变。想要固定 IP：左侧菜单 **Network & Security → Elastic IPs → Allocate Elastic IP address → Allocate**，然后选中它，**Actions → Associate Elastic IP address**，选这台实例。注意 AWS 对公网 IPv4 地址按小时收费；Elastic IP 不用了要 **Release**

11. 在本机 SSH 登录：

    ```bash
    chmod 400 ~/Downloads/fbs-key.pem
    ssh -i ~/Downloads/fbs-key.pem ec2-user@<EC2 公网 IP>
    ```

    连不上（超时）一般是你的 IP 变了：**EC2 → Security Groups → fbs-sg → Inbound rules → Edit inbound rules**，把各条规则的来源重新选一次 **My IP**，保存。Console 里的 **Connect → EC2 Instance Connect** 是从 AWS 的地址发起连接的，22 端口只对自己 IP 开放时用不了，用上面的 `ssh` 命令即可

不用的时候在实例列表里 **Instance state → Stop instance** 可以停掉计费（EBS 磁盘仍按容量收费）；**Terminate** 会连磁盘一起删掉，数据无法恢复。

### 2. 安装 Node、nginx、git、Python

```bash
sudo dnf install -y nginx git python3.12 make
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
sudo cp ~/factor-based-strategies-frontend/deploy/nginx.conf /etc/nginx/conf.d/fbs.conf
# Amazon Linux 的家目录默认是 700，nginx 用户进不去，读不到 dist/
chmod o+x /home/ec2-user
# nginx 自带的欢迎页站点（在 nginx.conf 里）如果标了 default_server，会和 fbs.conf 冲突，去掉它
sudo cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
sudo sed -i 's/ default_server//' /etc/nginx/nginx.conf
sudo nginx -t && sudo systemctl reload nginx
```

安全组的 80 端口对 Anywhere 开放时，先做完第 6 步再 `reload`，否则从 reload 到配好密码之间，任何人都能调用后端。

`nginx -t` 可能会提示 `conflicting server name "_" on 0.0.0.0:80, ignored`，可以忽略：`fbs.conf` 用的是 `listen 80 default_server`，不带域名的请求都会交给它。确认一下：

```bash
curl -I http://127.0.0.1/api/tables  # 不要用 localhost：它可能走 IPv6，而 fbs.conf 只监听 IPv4。配了 basic auth 应返回 401，没配应返回 200；返回 404 且页面是 "Welcome to nginx" 说明还是自带站点在响应
```

然后浏览器打开 `http://<EC2 公网 IP>/` 即可。

`deploy/nginx.conf` 做了四件事：

- `root` 指向 `dist/`
- `location /api/` 用 `proxy_pass http://127.0.0.1:8000` 转发给后端（端口后面不加 `/`，转发时保留 `/api` 前缀）
- `location /files/bronze/` 用 `alias` 直接提供后端仓库 `data/bronze/` 里的文件，页面"已下载文件"列表里的链接就指向这里。只开放 `bronze/`，`data/` 下其他目录不对外
- `try_files $uri $uri/ /index.html` 让所有其他路径回退到 `index.html`

所有登录的人共用同一个 `data/bronze/`，能看到并下载彼此的文件。

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

- 后端没有下载文件内容的接口，文件由 nginx 直接提供，所以 `npm run dev` 时"已下载文件"里的链接打不开（404），只有部署到 EC2 后才能下载
- 任务只保存在后端内存里，后端重启后就没有了
- 过滤值都按字符串发送；只有日期列支持起止范围，数值列不支持 `gt`/`lt` 范围过滤
