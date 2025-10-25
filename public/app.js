// 全局变量
let sites = [];
let currentEditId = null;

// DOM元素
const modal = document.getElementById('siteModal');
const addSiteBtn = document.getElementById('addSiteBtn');
const closeBtn = document.querySelector('.close');
const cancelBtn = document.getElementById('cancelBtn');
const siteForm = document.getElementById('siteForm');
const refreshBtn = document.getElementById('refreshBtn');
const checkAllBalancesBtn = document.getElementById('checkAllBalancesBtn');
const sitesTableBody = document.getElementById('sitesTableBody');
const modalTitle = document.getElementById('modalTitle');

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
});

// 设置事件监听
function setupEventListeners() {
    addSiteBtn.addEventListener('click', openAddModal);
    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);
    refreshBtn.addEventListener('click', loadData);
    checkAllBalancesBtn.addEventListener('click', checkAllBalances);
    siteForm.addEventListener('submit', handleSubmit);

    // 点击模态框外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

// 加载数据
async function loadData() {
    try {
        await Promise.all([loadStats(), loadSites()]);
    } catch (error) {
        console.error('加载数据失败:', error);
        alert('加载数据失败，请检查服务器是否运行');
    }
}

// 加载统计数据
async function loadStats() {
    const response = await fetch('/api/stats');
    const stats = await response.json();

    document.getElementById('totalSites').textContent = stats.total;
    document.getElementById('activeSites').textContent = stats.active;
    document.getElementById('lowBalanceSites').textContent = stats.lowBalance;
    document.getElementById('noBalanceSites').textContent = stats.noBalance;

    // 总余额超过100显示为$100+
    const totalBalanceDisplay = stats.totalBalance > 100 ? '$100+' : `$${stats.totalBalance.toFixed(2)}`;
    document.getElementById('totalBalance').textContent = totalBalanceDisplay;
}

// 加载站点列表
async function loadSites() {
    const response = await fetch('/api/sites');
    sites = await response.json();
    renderSites();
}

// 渲染站点列表
function renderSites() {
    if (sites.length === 0) {
        sitesTableBody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <div>暂无公益站数据，点击上方按钮添加</div>
                </td>
            </tr>
        `;
        return;
    }

    sitesTableBody.innerHTML = sites.map(site => {
        // 显示模型数量
        const modelCount = site.models ? site.models.length : 0;
        const modelText = modelCount > 0 ? `${modelCount} 个模型` : '未检查';

        // 格式化余额显示，超过100显示为100+
        const balanceDisplay = site.balance > 100 ? '$100+' : `$${site.balance.toFixed(2)}`;

        return `
        <tr>
            <td><strong>${escapeHtml(site.name)}</strong></td>
            <td>${escapeHtml(site.url)}</td>
            <td>
                <span class="balance ${getBalanceClass(site.balance)}">
                    ${balanceDisplay}
                </span>
            </td>
            <td>
                <div class="quota-info">
                    ${modelText}
                    ${modelCount > 0 ? `<button class="btn btn-small" onclick="showModels('${site.id}')" style="margin-left: 8px;">查看</button>` : ''}
                </div>
            </td>
            <td>
                <span class="status-badge ${site.status === 'active' ? 'status-active' : 'status-inactive'}">
                    ${site.status === 'active' ? '活跃' : '不活跃'}
                </span>
            </td>
            <td>${formatDate(site.lastChecked)}</td>
            <td>
                <button class="btn btn-small btn-check" onclick="checkBalance('${site.id}')">检查</button>
                <button class="btn btn-small btn-edit" onclick="editSite('${site.id}')">编辑</button>
                <button class="btn btn-small btn-delete" onclick="deleteSite('${site.id}')">删除</button>
            </td>
        </tr>
    `}).join('');
}

// 获取余额样式类
function getBalanceClass(balance) {
    if (balance <= 0) return 'zero';
    if (balance < 10) return 'low';
    return 'good';
}

// 格式化日期
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;

    return date.toLocaleDateString('zh-CN');
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 打开添加模态框
function openAddModal() {
    currentEditId = null;
    modalTitle.textContent = '添加公益站';
    siteForm.reset();
    modal.classList.add('show');
}

// 编辑站点
function editSite(id) {
    const site = sites.find(s => s.id === id);
    if (!site) return;

    currentEditId = id;
    modalTitle.textContent = '编辑公益站';

    document.getElementById('siteName').value = site.name;
    document.getElementById('siteUrl').value = site.url;
    document.getElementById('siteApiKey').value = site.apiKey;
    document.getElementById('siteBalance').value = site.balance;
    document.getElementById('siteStatus').value = site.status;

    modal.classList.add('show');
}

// 删除站点
async function deleteSite(id) {
    if (!confirm('确定要删除这个公益站吗?')) return;

    try {
        const response = await fetch(`/api/sites/${id}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadData();
            alert('删除成功!');
        } else {
            alert('删除失败');
        }
    } catch (error) {
        console.error('删除失败:', error);
        alert('删除失败');
    }
}

// 关闭模态框
function closeModal() {
    modal.classList.remove('show');
    siteForm.reset();
    currentEditId = null;
}

// 处理表单提交
async function handleSubmit(e) {
    e.preventDefault();

    const formData = {
        name: document.getElementById('siteName').value,
        url: document.getElementById('siteUrl').value,
        apiKey: document.getElementById('siteApiKey').value,
        balance: parseFloat(document.getElementById('siteBalance').value),
        status: document.getElementById('siteStatus').value
    };

    try {
        let response;
        if (currentEditId) {
            // 更新
            response = await fetch(`/api/sites/${currentEditId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
        } else {
            // 新增
            response = await fetch('/api/sites', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });
        }

        if (response.ok) {
            closeModal();
            await loadData();
            alert(currentEditId ? '更新成功!' : '添加成功!');
        } else {
            alert('操作失败');
        }
    } catch (error) {
        console.error('操作失败:', error);
        alert('操作失败');
    }
}

// 导出函数到全局作用域
window.editSite = editSite;
window.deleteSite = deleteSite;
window.checkBalance = checkBalance;
window.showModels = showModels;

// 显示模型列表
function showModels(id) {
    const site = sites.find(s => s.id === id);
    if (!site || !site.models || site.models.length === 0) {
        alert('暂无模型数据');
        return;
    }

    const modelList = site.models.join('\n');
    alert(`${site.name} 的可用模型 (${site.models.length}个):\n\n${modelList}`);
}

// 检查单个站点余额
async function checkBalance(id) {
    const btn = event.target;
    const originalText = btn.innerHTML;

    try {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading"></span>';

        const response = await fetch(`/api/sites/${id}/check-balance`, {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            await loadData();
            alert(`余额检查成功!\n令牌余额: $${result.balance.toFixed(2)}\n可用模型: ${result.modelCount} 个`);
        } else {
            alert(`检查失败: ${result.error}`);
        }
    } catch (error) {
        console.error('检查余额失败:', error);
        alert('检查余额失败');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// 批量检查所有站点余额
async function checkAllBalances() {
    if (sites.length === 0) {
        alert('暂无站点');
        return;
    }

    if (!confirm(`确定要检查所有 ${sites.length} 个站点的余额吗?`)) {
        return;
    }

    const originalText = checkAllBalancesBtn.innerHTML;

    try {
        checkAllBalancesBtn.disabled = true;
        checkAllBalancesBtn.innerHTML = '<span class="loading"></span> 检查中...';

        const response = await fetch('/api/sites/check-all-balances', {
            method: 'POST'
        });

        const result = await response.json();

        if (result.success) {
            await loadData();

            const successCount = result.results.filter(r => r.success).length;
            const failCount = result.results.filter(r => !r.success).length;

            let message = `批量检查完成!\n成功: ${successCount} 个\n失败: ${failCount} 个`;

            if (failCount > 0) {
                message += '\n\n失败的站点:\n';
                result.results
                    .filter(r => !r.success)
                    .forEach(r => {
                        message += `- ${r.name}: ${r.error}\n`;
                    });
            }

            alert(message);
        } else {
            alert('批量检查失败');
        }
    } catch (error) {
        console.error('批量检查失败:', error);
        alert('批量检查失败');
    } finally {
        checkAllBalancesBtn.disabled = false;
        checkAllBalancesBtn.innerHTML = originalText;
    }
}
