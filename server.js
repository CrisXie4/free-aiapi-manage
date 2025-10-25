const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

const app = express();

// 环境变量配置
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 15000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

// MySQL 配置
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 3306;
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'free_ai_api_control';

// 管理员账户配置（从环境变量读取）
const ADMIN_USERNAME = process.env.NAME || 'admin';
const ADMIN_PASSWORD = process.env.PASSWD || 'admin123';

// 创建 MySQL 连接池
const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Session 配置
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: NODE_ENV === 'production' && process.env.USE_HTTPS === 'true', // 生产环境且使用HTTPS时启用
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24小时
  }
}));

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 数据库初始化
async function initDatabase() {
  try {
    console.log('[数据库] 开始初始化...');

    // 创建用户表
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('[数据库] 用户表创建成功');

    // 检查是否存在管理员账户
    const [rows] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [ADMIN_USERNAME]
    );

    if (rows.length === 0) {
      // 创建管理员账户
      const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await pool.execute(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [ADMIN_USERNAME, hashedPassword]
      );
      console.log(`[数据库] 管理员账户创建成功: ${ADMIN_USERNAME}`);
    } else {
      console.log(`[数据库] 管理员账户已存在: ${ADMIN_USERNAME}`);
    }

    console.log('[数据库] 初始化完成');
  } catch (error) {
    console.error('[数据库] 初始化失败:', error.message);
    throw error;
  }
}

// 根路径重定向到主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 认证中间件
function requireAuth(req, res, next) {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.status(401).json({ error: '未授权访问，请先登录' });
}

// 登录 API
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '请输入用户名和密码' });
    }

    // 从数据库查询用户
    const [rows] = await pool.execute(
      'SELECT id, username, password FROM users WHERE username = ?',
      [username]
    );

    if (rows.length === 0) {
      console.log(`[认证] 登录失败 - 用户不存在: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = rows[0];

    // 验证密码
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      console.log(`[认证] 登录失败 - 密码错误: ${username}`);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    // 登录成功，设置 session
    req.session.isAuthenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.loginTime = new Date().toISOString();

    console.log(`[认证] 登录成功 - 用户: ${username}`);
    res.json({
      success: true,
      message: '登录成功',
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    console.error(`[认证] 登录错误:`, error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
  }
});

// 注册 API
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, confirmPassword } = req.body;

    // 验证输入
    if (!username || !password || !confirmPassword) {
      return res.status(400).json({ error: '请填写所有字段' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: '两次输入的密码不一致' });
    }

    if (username.length < 3 || username.length > 50) {
      return res.status(400).json({ error: '用户名长度应在 3-50 个字符之间' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少为 6 个字符' });
    }

    // 检查用户名是否已存在
    const [existingUsers] = await pool.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      console.log(`[注册] 失败 - 用户名已存在: ${username}`);
      return res.status(400).json({ error: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 插入新用户
    const [result] = await pool.execute(
      'INSERT INTO users (username, password) VALUES (?, ?)',
      [username, hashedPassword]
    );

    console.log(`[注册] 成功 - 新用户: ${username}`);

    res.json({
      success: true,
      message: '注册成功',
      user: {
        id: result.insertId,
        username: username
      }
    });
  } catch (error) {
    console.error(`[注册] 错误:`, error);
    res.status(500).json({ error: '注册失败，请稍后重试' });
  }
});

// 登出 API
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(`[认证] 登出错误:`, err);
      return res.status(500).json({ error: '登出失败' });
    }
    console.log(`[认证] 登出成功`);
    res.json({ success: true, message: '登出成功' });
  });
});

// 检查登录状态 API
app.get('/api/auth/check', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        loginTime: req.session.loginTime
      }
    });
  } else {
    res.json({ authenticated: false });
  }
});

// 数据文件路径
// 支持环境变量配置，Lambda环境使用/tmp目录，否则使用当前目录
const getDataFilePath = () => {
  // 优先使用环境变量
  if (process.env.DATA_FILE_PATH) {
    return process.env.DATA_FILE_PATH;
  }

  // 检测是否在Lambda环境中（/var/task是只读的）
  if (__dirname.startsWith('/var/task')) {
    return '/tmp/data.json';
  }

  // 默认使用当前目录
  return path.join(__dirname, 'data.json');
};

const DATA_FILE = getDataFilePath();

// 初始化数据文件
function initDataFile() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      const initialData = {
        sites: []
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
      console.log(`[初始化] 数据文件已创建: ${DATA_FILE}`);
    } else {
      console.log(`[初始化] 使用现有数据文件: ${DATA_FILE}`);
    }
  } catch (error) {
    console.error(`[初始化] 创建数据文件失败: ${error.message}`);
    console.error(`[初始化] 数据文件路径: ${DATA_FILE}`);
    // 在Lambda环境中，如果无法创建文件，我们仍然继续运行
    // 但需要确保读取操作能够处理文件不存在的情况
  }
}

// 读取数据
function readData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      console.warn(`[读取] 数据文件不存在，返回空数据: ${DATA_FILE}`);
      return { sites: [] };
    }
    const data = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`[读取] 读取数据文件失败: ${error.message}`);
    return { sites: [] };
  }
}

// 写入数据
function writeData(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log(`[写入] 数据已保存: ${DATA_FILE}`);
  } catch (error) {
    console.error(`[写入] 写入数据文件失败: ${error.message}`);
    console.error(`[写入] 数据文件路径: ${DATA_FILE}`);
    throw error; // 抛出错误，让调用者知道保存失败
  }
}

// API路由

// 获取所有公益站（需要认证）
app.get('/api/sites', requireAuth, (req, res) => {
  try {
    const data = readData();
    res.json(data.sites);
  } catch (error) {
    res.status(500).json({ error: '读取数据失败' });
  }
});

// 获取统计数据（需要认证）
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const data = readData();
    const sites = data.sites;

    const stats = {
      total: sites.length,
      active: sites.filter(s => s.status === 'active').length,
      noBalance: sites.filter(s => s.balance <= 0).length,
      lowBalance: sites.filter(s => s.balance > 0 && s.balance < 10).length,
      totalBalance: sites.reduce((sum, s) => sum + (s.balance || 0), 0)
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: '获取统计数据失败' });
  }
});

// 添加公益站（需要认证）
app.post('/api/sites', requireAuth, (req, res) => {
  try {
    const data = readData();
    const newSite = {
      id: Date.now().toString(),
      name: req.body.name,
      url: req.body.url,
      apiKey: req.body.apiKey,
      balance: parseFloat(req.body.balance) || 0,
      status: req.body.status || 'active',
      createdAt: new Date().toISOString(),
      lastChecked: new Date().toISOString()
    };

    data.sites.push(newSite);
    writeData(data);

    res.json({ success: true, site: newSite });
  } catch (error) {
    res.status(500).json({ error: '添加公益站失败' });
  }
});

// 更新公益站（需要认证）
app.put('/api/sites/:id', requireAuth, (req, res) => {
  try {
    const data = readData();
    const siteIndex = data.sites.findIndex(s => s.id === req.params.id);

    if (siteIndex === -1) {
      return res.status(404).json({ error: '公益站不存在' });
    }

    data.sites[siteIndex] = {
      ...data.sites[siteIndex],
      name: req.body.name,
      url: req.body.url,
      apiKey: req.body.apiKey,
      balance: parseFloat(req.body.balance),
      status: req.body.status,
      lastChecked: new Date().toISOString()
    };

    writeData(data);
    res.json({ success: true, site: data.sites[siteIndex] });
  } catch (error) {
    res.status(500).json({ error: '更新公益站失败' });
  }
});

// 删除公益站（需要认证）
app.delete('/api/sites/:id', requireAuth, (req, res) => {
  try {
    const data = readData();
    data.sites = data.sites.filter(s => s.id !== req.params.id);
    writeData(data);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除公益站失败' });
  }
});

// 检查单个站点余额（需要认证）
app.post('/api/sites/:id/check-balance', requireAuth, async (req, res) => {
  try {
    const data = readData();
    const site = data.sites.find(s => s.id === req.params.id);

    if (!site) {
      return res.status(404).json({ error: '公益站不存在' });
    }

    const balanceData = await fetchTokenBalance(site.url, site.apiKey);

    // 更新余额和模型
    const siteIndex = data.sites.findIndex(s => s.id === req.params.id);
    data.sites[siteIndex].balance = balanceData.balance;
    data.sites[siteIndex].totalLimit = balanceData.totalLimit;
    data.sites[siteIndex].models = balanceData.models;
    data.sites[siteIndex].lastChecked = new Date().toISOString();

    writeData(data);

    res.json({
      success: true,
      balance: balanceData.balance,
      totalLimit: balanceData.totalLimit,
      models: balanceData.models,
      modelCount: balanceData.models.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message || '检查余额失败' });
  }
});

// 批量检查所有站点余额
app.post('/api/sites/check-all-balances', async (req, res) => {
  try {
    const data = readData();
    const results = [];

    for (const site of data.sites) {
      try {
        const balanceData = await fetchTokenBalance(site.url, site.apiKey);

        const siteIndex = data.sites.findIndex(s => s.id === site.id);
        data.sites[siteIndex].balance = balanceData.balance;
        data.sites[siteIndex].totalLimit = balanceData.totalLimit;
        data.sites[siteIndex].models = balanceData.models;
        data.sites[siteIndex].lastChecked = new Date().toISOString();

        results.push({
          id: site.id,
          name: site.name,
          success: true,
          balance: balanceData.balance,
          modelCount: balanceData.models.length
        });
      } catch (error) {
        results.push({
          id: site.id,
          name: site.name,
          success: false,
          error: error.message
        });
      }
    }

    writeData(data);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: '批量检查失败' });
  }
});

// 从API获取令牌余额和模型的辅助函数
function fetchTokenBalance(apiUrl, apiKey) {
  return new Promise((resolve, reject) => {
    // 构建完整的API地址 - 获取订阅信息
    let baseUrl = apiUrl.replace(/\/$/, ''); // 移除末尾的斜杠
    const subscriptionUrl = `${baseUrl}/v1/dashboard/billing/subscription`;

    console.log(`[令牌检查] 开始检查: ${subscriptionUrl}`);

    try {
      const urlObj = new URL(subscriptionUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`, // 使用Bearer格式
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: API_TIMEOUT,
        rejectUnauthorized: false // 允许自签名证书
      };

      const request = protocol.request(options, (response) => {
        let data = '';

        console.log(`[令牌检查] 响应状态: ${response.statusCode}`);

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            console.log(`[令牌检查] 响应数据: ${data.substring(0, 300)}...`);

            const jsonData = JSON.parse(data);

            // OpenAI格式的订阅信息
            if (jsonData.hard_limit_usd !== undefined) {
              const balance = jsonData.hard_limit_usd || 0;

              console.log(`[令牌检查] 成功 - 余额: $${balance.toFixed(2)}`);

              // 获取模型列表
              fetchModels(baseUrl, apiKey)
                .then(models => {
                  resolve({
                    balance: parseFloat(balance.toFixed(2)),
                    totalLimit: jsonData.hard_limit_usd,
                    models: models
                  });
                })
                .catch(error => {
                  // 即使获取模型失败，也返回余额信息
                  console.warn(`[模型检查] 获取模型失败: ${error.message}`);
                  resolve({
                    balance: parseFloat(balance.toFixed(2)),
                    totalLimit: jsonData.hard_limit_usd,
                    models: []
                  });
                });
            } else {
              const errorMsg = jsonData.error?.message || '获取订阅信息失败';
              console.error(`[令牌检查] 失败: ${errorMsg}`);
              reject(new Error(errorMsg));
            }
          } catch (error) {
            console.error(`[令牌检查] 解析错误:`, error);
            console.error(`[令牌检查] 原始数据:`, data);
            reject(new Error(`解析API响应失败: ${error.message}`));
          }
        });
      });

      request.on('error', (error) => {
        console.error(`[令牌检查] 请求错误:`, error);
        reject(new Error(`请求失败: ${error.message}`));
      });

      request.on('timeout', () => {
        console.error(`[令牌检查] 请求超时`);
        request.destroy();
        reject(new Error('请求超时(15秒)'));
      });

      request.end();
    } catch (error) {
      console.error(`[令牌检查] 初始化错误:`, error);
      reject(new Error(`初始化请求失败: ${error.message}`));
    }
  });
}

// 获取可用模型列表
function fetchModels(baseUrl, apiKey) {
  return new Promise((resolve, reject) => {
    const modelsUrl = `${baseUrl}/v1/models`;

    console.log(`[模型检查] 开始获取模型: ${modelsUrl}`);

    try {
      const urlObj = new URL(modelsUrl);
      const protocol = urlObj.protocol === 'https:' ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0'
        },
        timeout: API_TIMEOUT,
        rejectUnauthorized: false
      };

      const request = protocol.request(options, (response) => {
        let data = '';

        response.on('data', (chunk) => {
          data += chunk;
        });

        response.on('end', () => {
          try {
            const jsonData = JSON.parse(data);

            if (jsonData.data && Array.isArray(jsonData.data)) {
              // 提取模型ID列表
              const modelIds = jsonData.data.map(m => m.id);
              console.log(`[模型检查] 成功 - 找到 ${modelIds.length} 个模型`);
              resolve(modelIds);
            } else {
              resolve([]);
            }
          } catch (error) {
            console.error(`[模型检查] 解析错误:`, error);
            resolve([]);
          }
        });
      });

      request.on('error', (error) => {
        console.error(`[模型检查] 请求错误:`, error);
        resolve([]);
      });

      request.on('timeout', () => {
        console.error(`[模型检查] 请求超时`);
        request.destroy();
        resolve([]);
      });

      request.end();
    } catch (error) {
      console.error(`[模型检查] 初始化错误:`, error);
      resolve([]);
    }
  });
}

// 启动服务器
async function startServer() {
  try {
    // 初始化数据库
    await initDatabase();

    // 初始化数据文件
    initDataFile();

    // 启动服务器
    app.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log(`公益站API管理系统`);
      console.log(`环境: ${NODE_ENV}`);
      console.log(`端口: ${PORT}`);
      console.log(`数据文件: ${DATA_FILE}`);
      console.log(`数据库: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
      console.log(`访问地址: http://localhost:${PORT}`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('[启动] 服务器启动失败:', error);
    process.exit(1);
  }
}

// 启动应用
startServer();
