const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const app = express();
const PORT = 3000;

// 中间件
app.use(express.json());
app.use(express.static('public'));

// 根路径重定向到主页
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 数据文件路径
const DATA_FILE = path.join(__dirname, 'data.json');

// 初始化数据文件
function initDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      sites: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }
}

// 读取数据
function readData() {
  const data = fs.readFileSync(DATA_FILE, 'utf8');
  return JSON.parse(data);
}

// 写入数据
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// API路由

// 获取所有公益站
app.get('/api/sites', (req, res) => {
  try {
    const data = readData();
    res.json(data.sites);
  } catch (error) {
    res.status(500).json({ error: '读取数据失败' });
  }
});

// 获取统计数据
app.get('/api/stats', (req, res) => {
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

// 添加公益站
app.post('/api/sites', (req, res) => {
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

// 更新公益站
app.put('/api/sites/:id', (req, res) => {
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

// 删除公益站
app.delete('/api/sites/:id', (req, res) => {
  try {
    const data = readData();
    data.sites = data.sites.filter(s => s.id !== req.params.id);
    writeData(data);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: '删除公益站失败' });
  }
});

// 检查单个站点余额
app.post('/api/sites/:id/check-balance', async (req, res) => {
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
        timeout: 15000,
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
        timeout: 15000,
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
initDataFile();
app.listen(PORT, () => {
  console.log(`公益站API管理系统运行在 http://localhost:${PORT}`);
});
