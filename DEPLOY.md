# 部署指南

本文档提供多种部署方式的详细说明。

## 📋 目录

- [环境要求](#环境要求)
- [部署方式](#部署方式)
  - [1. 直接运行](#1-直接运行)
  - [2. PM2 部署](#2-pm2-部署)
  - [3. Docker 部署](#3-docker-部署)
  - [4. Docker Compose 部署](#4-docker-compose-部署)
  - [5. 无服务器部署](#5-无服务器部署)
- [生产环境配置](#生产环境配置)
- [监控与维护](#监控与维护)

---

## 环境要求

- **Node.js**: >= 16.0.0
- **NPM**: >= 8.0.0
- **系统**: Linux / macOS / Windows
- **端口**: 3000 (默认，可配置)

---

## 部署方式

### 1. 直接运行

最简单的部署方式，适合开发和小型项目。

```bash
# 1. 克隆项目
git clone https://github.com/CrisXie4/free-aiapi-manage.git
cd free-aiapi-manage

# 2. 安装依赖
npm install

# 3. 配置环境变量（可选）
cp .env.example .env
# 编辑 .env 文件设置配置

# 4. 启动应用
npm start

# 或使用生产模式
npm run prod
```

**优点**: 简单快速
**缺点**: 进程管理不便，不推荐生产环境

---

### 2. PM2 部署

使用 PM2 进行进程管理，适合生产环境。

#### 安装 PM2

```bash
npm install -g pm2
```

#### 部署步骤

```bash
# 1. 安装项目依赖
npm install --production

# 2. 使用 PM2 启动
npm run pm2:start

# 或直接使用 PM2 命令
pm2 start ecosystem.config.js --env production
```

#### PM2 常用命令

```bash
# 查看应用状态
npm run pm2:monit
# 或
pm2 list

# 查看日志
npm run pm2:logs
# 或
pm2 logs free-ai-api-control

# 重启应用
npm run pm2:restart

# 停止应用
npm run pm2:stop

# 删除应用
npm run pm2:delete
```

#### PM2 开机自启

```bash
# 保存当前 PM2 进程列表
pm2 save

# 生成开机启动脚本
pm2 startup

# 按照提示执行命令（通常需要 sudo）
```

**优点**:
- 自动重启
- 日志管理
- 进程监控
- 负载均衡

**推荐**: ✅ 生产环境推荐

---

### 3. Docker 部署

使用 Docker 容器化部署。

#### 前置要求

安装 [Docker](https://docs.docker.com/get-docker/)

#### 部署步骤

```bash
# 1. 构建镜像
npm run docker:build
# 或
docker build -t free-ai-api-control .

# 2. 运行容器
npm run docker:run
# 或
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/app/data \
  --name free-ai-api-control \
  free-ai-api-control

# 3. 查看日志
docker logs -f free-ai-api-control

# 4. 停止容器
npm run docker:stop
# 或
docker stop free-ai-api-control

# 5. 删除容器
docker rm free-ai-api-control
```

#### 自定义配置

```bash
# 使用环境变量
docker run -d \
  -p 8080:3000 \
  -e PORT=3000 \
  -e NODE_ENV=production \
  -v $(pwd)/data:/app/data \
  --name free-ai-api-control \
  free-ai-api-control
```

**优点**:
- 环境隔离
- 易于迁移
- 版本管理

---

### 4. Docker Compose 部署

使用 Docker Compose 一键部署（包含 Nginx 反向代理）。

#### 部署步骤

```bash
# 1. 启动所有服务
npm run docker:compose:up
# 或
docker-compose up -d

# 2. 查看日志
npm run docker:compose:logs
# 或
docker-compose logs -f

# 3. 停止所有服务
npm run docker:compose:down
# 或
docker-compose down
```

#### 配置说明

1. **仅运行应用**（不使用 Nginx）：

编辑 `docker-compose.yml`，注释掉 `nginx` 服务部分。

2. **使用 Nginx 反向代理**：

```bash
# 修改 nginx/conf.d/default.conf
# 将 your-domain.com 改为你的域名

# 如果需要 HTTPS，配置 SSL 证书
# 取消注释 HTTPS 相关配置
```

3. **持久化数据**：

数据自动保存在 `./data` 目录中。

**优点**:
- 一键部署
- 包含反向代理
- 易于扩展

**推荐**: ✅ 最佳实践

---

### 5. 无服务器部署

适用于 AWS Lambda、Vercel、Netlify 等平台。

#### AWS Lambda

代码已自动适配 Lambda 环境：

- 数据文件自动保存到 `/tmp` 目录
- 支持环境变量配置

**注意**: `/tmp` 目录数据不持久化，建议配合 S3 或 DynamoDB 使用。

#### Vercel / Netlify

1. 创建 `vercel.json` 或 `netlify.toml`
2. 配置路由规则
3. 部署到平台

---

## 生产环境配置

### 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# 服务器配置
NODE_ENV=production
PORT=3000

# 数据文件路径（可选）
# DATA_FILE_PATH=/path/to/data.json

# 日志级别
LOG_LEVEL=info

# API 超时时间（毫秒）
API_TIMEOUT=15000
```

### Nginx 反向代理

如果不使用 Docker Compose，可以手动配置 Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL 证书（HTTPS）

#### 使用 Let's Encrypt

```bash
# 安装 Certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 防火墙配置

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp  # 如果需要直接访问

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=80/tcp
sudo firewall-cmd --permanent --add-port=443/tcp
sudo firewall-cmd --reload
```

---

## 监控与维护

### 日志管理

#### PM2 日志

```bash
# 查看实时日志
pm2 logs free-ai-api-control

# 清空日志
pm2 flush

# 日志轮转
pm2 install pm2-logrotate
```

#### Docker 日志

```bash
# 查看容器日志
docker logs -f free-ai-api-control

# 限制日志大小
docker run -d \
  --log-opt max-size=10m \
  --log-opt max-file=3 \
  ...
```

### 性能监控

```bash
# PM2 监控
pm2 monit

# 查看进程状态
pm2 list

# 查看详细信息
pm2 show free-ai-api-control
```

### 数据备份

```bash
# 备份数据文件
cp data.json data.json.backup.$(date +%Y%m%d)

# 定时备份（添加到 crontab）
0 2 * * * cp /path/to/data.json /path/to/backup/data.json.$(date +\%Y\%m\%d)
```

### 更新应用

```bash
# Git 更新
git pull origin main

# 重新安装依赖
npm install --production

# PM2 重启
pm2 restart ecosystem.config.js

# Docker 更新
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## 故障排查

### 常见问题

1. **端口被占用**
   ```bash
   # 查找占用端口的进程
   lsof -i :3000
   # 或
   netstat -tulpn | grep 3000
   ```

2. **权限问题**
   ```bash
   # 确保数据目录有写权限
   chmod 755 data/
   ```

3. **无法写入文件**
   - 检查是否在只读文件系统
   - 检查 DATA_FILE_PATH 配置
   - Lambda 环境使用 /tmp 目录

4. **内存不足**
   ```bash
   # PM2 设置内存限制
   pm2 start ecosystem.config.js --max-memory-restart 500M
   ```

---

## 支持

如有问题，请查看：
- [README.md](./README.md) - 项目说明
- [INTRO.md](./INTRO.md) - 项目介绍
- [GitHub Issues](https://github.com/CrisXie4/free-aiapi-manage/issues)

---

**祝部署顺利！** 🚀
