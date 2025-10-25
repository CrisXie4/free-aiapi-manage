# 公益站API管理系统

一个基于Node.js的公益站API管理系统，提供直观的Dashboard界面来管理和监控多个公益API站点的令牌余额和可用模型。

**在线演示**: [https://freeapimanage.crisxie.top](https://freeapimanage.crisxie.top)

---

## 功能特性

### 📊 Dashboard数据统计
- 总站点数统计
- 活跃站点监控
- 余额不足警告（低于$10）
- 无余额站点提醒
- 总余额汇总（超过$100显示为$100+）

### 🛠️ 站点管理
- 添加新的公益站（支持OpenAI兼容的API）
- 编辑站点信息（名称、地址、密钥、状态）
- 删除站点
- 实时检查令牌余额
- 自动获取可用模型列表

### 🎨 用户界面
- 响应式设计，支持PC和移动端
- 现代化渐变色UI设计
- 实时余额状态颜色提醒
- 流畅的加载动画
- 模型列表查看功能

---

## 快速开始

### 本地部署

1. **克隆项目**
```bash
git clone <repository-url>
cd free-ai-api-control
```

2. **安装依赖**
```bash
npm install
```

3. **启动服务器**
```bash
npm start
```

4. **访问系统**
打开浏览器访问: `http://localhost:3000`

### 服务器部署

#### 使用PM2（推荐）

1. **安装PM2**
```bash
npm install -g pm2
```

2. **启动应用**
```bash
pm2 start server.js --name "free-api-manager"
```

3. **设置开机自启**
```bash
pm2 startup
pm2 save
```

4. **查看日志**
```bash
pm2 logs free-api-manager
```

#### 使用Nginx反向代理

创建Nginx配置 `/etc/nginx/sites-available/freeapi`:

```nginx
server {
    listen 80;
    server_name freeapimanage.crisxie.top;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

启用配置并配置SSL（可选，使用Let's Encrypt）:
```bash
sudo ln -s /etc/nginx/sites-available/freeapi /etc/nginx/sites-enabled/
sudo certbot --nginx -d freeapimanage.crisxie.top
sudo nginx -t
sudo systemctl reload nginx
```

---

## 使用指南

### 1. 添加公益站

1. 点击右上角 **"+ 添加公益站"** 按钮
2. 填写站点信息：
   - **站点名称**: 如 "OpenAI公益站"
   - **API地址**: 如 `https://api.example.com`
   - **API密钥**: 以 `sk-` 开头的密钥
   - **余额**: 初始余额（检查后会自动更新）
   - **状态**: 活跃/不活跃
3. 点击 **"保存"**

### 2. 检查令牌余额

#### 单个站点检查
- 在站点列表中点击 **"检查"** 按钮
- 系统会调用 `/v1/dashboard/billing/subscription` 获取令牌余额
- 同时调用 `/v1/models` 获取可用模型列表

#### 批量检查所有站点
- 点击页面顶部 **"🔄 检查所有余额"** 按钮
- 系统会依次检查所有站点
- 显示成功/失败统计

### 3. 查看可用模型

1. 检查余额后，"可用模型"列会显示模型数量
2. 点击 **"查看"** 按钮查看完整模型列表
3. 支持的模型包括：gpt-4, gpt-3.5-turbo, claude等

### 4. 管理站点

- **编辑**: 点击"编辑"按钮修改站点信息
- **删除**: 点击"删除"按钮移除站点（需确认）
- **刷新数据**: 点击"刷新数据"按钮重新加载统计信息

---

## 项目结构

```
free-ai-api-control/
├── public/              # 前端静态文件
│   ├── index.html      # 主页面
│   ├── style.css       # 样式文件
│   └── app.js          # 前端逻辑
├── server.js           # Node.js后端服务器
├── package.json        # 项目依赖配置
├── data.json           # 数据存储（自动生成）
└── README.md           # 项目文档
```

---

## API接口说明

### 站点管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sites` | 获取所有公益站列表 |
| POST | `/api/sites` | 添加新公益站 |
| PUT | `/api/sites/:id` | 更新公益站信息 |
| DELETE | `/api/sites/:id` | 删除公益站 |
| GET | `/api/stats` | 获取统计数据 |

### 余额检查

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sites/:id/check-balance` | 检查单个站点余额 |
| POST | `/api/sites/check-all-balances` | 批量检查所有站点余额 |

### 外部API调用

系统会调用以下公益站API端点：

- **余额查询**: `{API地址}/v1/dashboard/billing/subscription`
- **模型列表**: `{API地址}/v1/models`

---

## 技术栈

### 后端
- **Node.js** - JavaScript运行环境
- **Express** - Web框架
- **原生HTTP/HTTPS** - API请求

### 前端
- **原生HTML** - 页面结构
- **原生CSS** - 样式设计（渐变色、动画）
- **原生JavaScript** - 交互逻辑（无框架依赖）

### 数据存储
- **JSON文件** - 轻量级数据持久化

---

## 特色功能

### 🎯 智能余额提醒
- **$0**: 红色显示，标记为"无余额站点"
- **$0.01 - $9.99**: 橙色显示，标记为"余额不足"
- **$10+**: 绿色显示
- **超过$100**: 显示为 `$100+`

### 🔄 实时检查
- 支持单个站点实时检查
- 支持批量检查所有站点
- 检查时显示加载动画
- 自动更新最后检查时间

### 📱 响应式设计
- 适配桌面端（1400px最大宽度）
- 适配移动端（自动换列）
- 触摸友好的按钮设计

### 🔐 安全特性
- 支持自签名SSL证书
- API密钥加密存储（需自行实现）
- HTTPS反向代理支持

---

## 配置说明

### 修改端口

编辑 `server.js` 文件：

```javascript
const PORT = 3000; // 修改为你想要的端口
```

### 修改余额阈值

编辑 `server.js` 中的统计逻辑：

```javascript
lowBalance: sites.filter(s => s.balance > 0 && s.balance < 10).length, // 修改10为其他值
```

### 修改显示阈值

编辑 `public/app.js`：

```javascript
const balanceDisplay = site.balance > 100 ? '$100+' : `$${site.balance.toFixed(2)}`; // 修改100
```

---

## 常见问题

### Q1: 检查余额时提示"Access token 无效"？
**A**: 确保API密钥格式正确（通常是 `sk-` 开头），并且密钥有效未过期。

### Q2: 无法连接到API？
**A**: 检查API地址是否正确，网络是否可达。系统支持HTTP和HTTPS，会自动处理SSL证书。

### Q3: 数据丢失了？
**A**: 数据存储在 `data.json` 文件中，定期备份该文件。部署时建议将其加入版本控制忽略列表。

### Q4: 如何批量导入站点？
**A**: 直接编辑 `data.json` 文件，按格式添加站点数据，然后重启服务器。

### Q5: 支持哪些API类型？
**A**: 支持所有兼容OpenAI API格式的服务，包括但不限于：OpenAI官方、Azure OpenAI、One API、New API等。

---

## 安全建议

1. **生产环境**
   - 使用HTTPS（配置Nginx + Let's Encrypt）
   - 限制访问IP（通过Nginx配置）
   - 添加用户认证（后续版本支持）

2. **数据备份**
   - 定期备份 `data.json`
   - 使用Git管理配置

3. **API密钥安全**
   - 不要将密钥提交到公开仓库
   - 定期轮换API密钥
   - 考虑使用环境变量存储敏感信息

---

## 更新日志

### v1.0.0 (2025-01-XX)
- ✅ 基础站点管理功能
- ✅ 令牌余额检查（OpenAI格式）
- ✅ 可用模型列表获取
- ✅ Dashboard统计面板
- ✅ 响应式UI设计
- ✅ 余额超过$100显示为$100+

---

## 未来规划

- [ ] 用户认证和权限管理
- [ ] 定时自动检查余额
- [ ] 余额低于阈值邮件/Webhook通知
- [ ] 数据导出（Excel/CSV）
- [ ] 站点健康检查（ping测试）
- [ ] 使用量统计图表
- [ ] 多语言支持（中文/英文）
- [ ] 暗黑模式
- [ ] Docker部署支持

---

## 贡献指南

欢迎提交Issue和Pull Request！

1. Fork本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

---

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。

---

## 联系方式

- **项目地址**: https://github.com/yourusername/free-ai-api-control
- **在线演示**: https://freeapimanage.crisxie.top
- **问题反馈**: [提交Issue](https://github.com/yourusername/free-ai-api-control/issues)

---

## 致谢

感谢所有公益API提供者为开源社区做出的贡献！

---

**⭐ 如果这个项目对你有帮助，请给个Star支持一下！**

