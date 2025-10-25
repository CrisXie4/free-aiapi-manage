const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const session = require('express-session');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();

// 环境变量配置
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 15000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'your-secret-key-change-in-production';

// 数据目录
const DATA_DIR = path.join(__dirname, 'user_data');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`[初始化] 创建数据目录: ${DATA_DIR}`);
}

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

// 根据密码生成文件名（使用 SHA256 hash）
function getDataFileForPassword(password) {
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  return path.join(DATA_DIR, `data_${hash}.json`);
}

// 检查密码对应的数据文件是否存在
function passwordExists(password) {
  const filePath = getDataFileForPassword(password);
  return fs.existsSync(filePath);
}

// 创建新的数据文件
function createDataFileForPassword(password) {
  const filePath = getDataFileForPassword(password);
  const initialData = {
    sites: [],
    createdAt: new Date().toISOString(),
    passwordHash: bcrypt.hashSync(password, 10) // 保存密码 hash 用于验证
  };
  fs.writeFileSync(filePath, JSON.stringify(initialData, null, 2));
  console.log(`[账户] 创建新账户，数据文件: ${path.basename(filePath)}`);
  return filePath;
}

// 验证密码
function verifyPassword(password, filePath) {
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (data.passwordHash) {
      return bcrypt.compareSync(password, data.passwordHash);
    }
    // 旧数据文件可能没有 passwordHash，直接返回 true
    return true;
  } catch (error) {
    console.error('[验证] 密码验证失败:', error);
    return false;
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

// 登录 API（如果密码不存在则自动创建账户）
app.post('/api/login', async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: '请输入密码' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度至少为 6 个字符' });
    }

    let dataFile;
    let isNewAccount = false;

    // 检查密码对应的数据文件是否存在
    if (passwordExists(password)) {
      // 密码存在，读取数据
      dataFile = getDataFileForPassword(password);

      // 验证密码
      if (!verifyPassword(password, dataFile)) {
        console.log(`[登录] 密码验证失败`);
        return res.status(401).json({ error: '密码错误' });
      }

      console.log(`[登录] 登录成功 - 数据文件: ${path.basename(dataFile)}`);
    } else {
      // 密码不存在，创建新账户
      dataFile = createDataFileForPassword(password);
      isNewAccount = true;
      console.log(`[登录] 创建新账户 - 数据文件: ${path.basename(dataFile)}`);
    }

    // 设置 session
    req.session.isAuthenticated = true;
    req.session.dataFile = dataFile;
    req.session.loginTime = new Date().toISOString();

    res.json({
      success: true,
      message: isNewAccount ? '账户创建成功，欢迎使用！' : '登录成功',
      isNewAccount: isNewAccount
    });
  } catch (error) {
    console.error(`[登录] 错误:`, error);
    res.status(500).json({ error: '登录失败，请稍后重试' });
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
      loginTime: req.session.loginTime
    });
  } else {
    res.json({ authenticated: false });
  }
});

// 修改密码 API
app.post('/api/change-password', requireAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少为 6 个字符' });
    }

    if (oldPassword === newPassword) {
      return res.status(400).json({ error: '新密码不能与旧密码相同' });
    }

    // 验证旧密码
    const oldDataFile = req.session.dataFile;
    if (!verifyPassword(oldPassword, oldDataFile)) {
      return res.status(401).json({ error: '当前密码错误' });
    }

    // 读取旧数据文件的数据
    const oldData = JSON.parse(fs.readFileSync(oldDataFile, 'utf8'));

    // 创建新的数据文件
    const newDataFile = getDataFileForPassword(newPassword);

    // 检查新密码是否已被使用
    if (fs.existsSync(newDataFile)) {
      return res.status(400).json({ error: '新密码已被其他账户使用，请选择其他密码' });
    }

    // 将数据复制到新文件
    const newData = {
      sites: oldData.sites || [],
      createdAt: oldData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      passwordHash: bcrypt.hashSync(newPassword, 10)
    };

    fs.writeFileSync(newDataFile, JSON.stringify(newData, null, 2));
    console.log(`[修改密码] 创建新数据文件: ${path.basename(newDataFile)}`);

    // 删除旧数据文件
    try {
      fs.unlinkSync(oldDataFile);
      console.log(`[修改密码] 删除旧数据文件: ${path.basename(oldDataFile)}`);
    } catch (error) {
      console.warn(`[修改密码] 无法删除旧数据文件: ${error.message}`);
    }

    // 清除 session（强制重新登录）
    req.session.destroy();

    res.json({
      success: true,
      message: '密码修改成功，请使用新密码重新登录'
    });

  } catch (error) {
    console.error('[修改密码] 错误:', error);
    res.status(500).json({ error: '修改密码失败，请稍后重试' });
  }
});

// 读取数据（从用户的数据文件）
function readData(dataFile) {
  try {
    if (!dataFile) {
      console.error('[读取] 数据文件路径未指定');
      return { sites: [] };
    }

    if (!fs.existsSync(dataFile)) {
      console.warn(`[读取] 数据文件不存在，返回空数据: ${path.basename(dataFile)}`);
      return { sites: [] };
    }

    const data = fs.readFileSync(dataFile, 'utf8');
    const jsonData = JSON.parse(data);

    // 只返回 sites 数组，不包含密码等敏感信息
    return {
      sites: jsonData.sites || []
    };
  } catch (error) {
    console.error(`[读取] 读取数据文件失败: ${error.message}`);
    return { sites: [] };
  }
}

// 写入数据（到用户的数据文件）
function writeData(dataFile, newData) {
  try {
    if (!dataFile) {
      throw new Error('数据文件路径未指定');
    }

    // 读取现有数据（包含 passwordHash 等信息）
    let fullData = { sites: [] };
    if (fs.existsSync(dataFile)) {
      try {
        fullData = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      } catch (e) {
        console.warn('[写入] 读取现有数据失败，将创建新文件');
      }
    }

    // 更新 sites 数据，保留其他字段
    fullData.sites = newData.sites || [];
    fullData.updatedAt = new Date().toISOString();

    fs.writeFileSync(dataFile, JSON.stringify(fullData, null, 2));
    console.log(`[写入] 数据已保存: ${path.basename(dataFile)}`);
  } catch (error) {
    console.error(`[写入] 写入数据文件失败: ${error.message}`);
    console.error(`[写入] 数据文件路径: ${dataFile}`);
    throw error;
  }
}

// API路由

// 获取所有公益站（需要认证）
app.get('/api/sites', requireAuth, (req, res) => {
  try {
    const data = readData(req.session.dataFile);
    res.json(data.sites);
  } catch (error) {
    res.status(500).json({ error: '读取数据失败' });
  }
});

// 获取统计数据（需要认证）
app.get('/api/stats', requireAuth, (req, res) => {
  try {
    const data = readData(req.session.dataFile);
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
    const data = readData(req.session.dataFile);
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
    writeData(req.session.dataFile, data);

    res.json({ success: true, site: newSite });
  } catch (error) {
    res.status(500).json({ error: '添加公益站失败' });
  }
});

// 更新公益站（需要认证）
app.put('/api/sites/:id', requireAuth, (req, res) => {
  try {
    const data = readData(req.session.dataFile);
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

    writeData(req.session.dataFile, data);
    res.json({ success: true, site: data.sites[siteIndex] });
  } catch (error) {
    res.status(500).json({ error: '更新公益站失败' });
  }
});

// 删除公益站（需要认证）
app.delete('/api/sites/:id', requireAuth, (req, res) => {
  try {
    const data = readData(req.session.dataFile);
    data.sites = data.sites.filter(s => s.id !== req.params.id);
    writeData(req.session.dataFile, data);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除公益站失败' });
  }
});

// 检查单个站点余额（需要认证）
app.post('/api/sites/:id/check-balance', requireAuth, async (req, res) => {
  try {
    const data = readData(req.session.dataFile);
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

    writeData(req.session.dataFile, data);

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
app.post('/api/sites/check-all-balances', requireAuth, async (req, res) => {
  try {
    const data = readData(req.session.dataFile);
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

    writeData(req.session.dataFile, data);
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
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`公益站API管理系统`);
  console.log(`环境: ${NODE_ENV}`);
  console.log(`端口: ${PORT}`);
  console.log(`数据目录: ${DATA_DIR}`);
  console.log(`访问地址: http://localhost:${PORT}`);
  console.log('='.repeat(60));
  console.log('[提示] 输入任意密码即可登录，新密码将自动创建账户');
});
