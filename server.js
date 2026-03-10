const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3456;
const DOC_DIR = process.env.DOC_DIR || path.join(process.cwd(), 'doc');
const APIS_FILE = path.join(DOC_DIR, 'apis.json');
const MD_FILE = path.join(DOC_DIR, '爬虫文档.md');

if (!fs.existsSync(DOC_DIR)) {
  fs.mkdirSync(DOC_DIR, { recursive: true });
}

function parseCurl(curl) {
  const result = { method: 'GET', url: '', headers: {} };
  
  const methodMatch = curl.match(/-X\s+(\w+)/i);
  if (methodMatch) result.method = methodMatch[1].toUpperCase();

  const urlMatch = curl.match(/['"]([^'"]+)['"]/);
  if (urlMatch) {
    try {
      const u = new URL(urlMatch[1]);
      result.url = u.origin + u.pathname;
    } catch (e) {
      result.url = urlMatch[1];
    }
  }

  const headerMatches = curl.matchAll(/-H\s+['"]([^:]+):\s*([^'"]+)['"]/g);
  for (const m of headerMatches) {
    result.headers[m[1].trim()] = m[2].trim();
  }

  return result;
}

function updateMarkdown(apis) {
  let content = `# 爬虫文档

> 最后更新: ${new Date().toLocaleString()}

---

## 接口列表

`;
  apis.forEach((api, index) => {
    content += `### ${index + 1}. ${api.name || '未命名'}

**方法**: \`${api.method || 'GET'}\`  
**URL**: \`${api.url || '-'}\`  
**更新时间**: ${api.updatedAt || '-'}

#### cURL 命令

\`\`\`bash
${api.curl || '-'}
\`\`\`

#### 响应内容

\`\`\`json
${api.response || '-'}
\`\`\`

${api.notes ? `#### 备注\n\n${api.notes}\n` : ''}

---

`;
  });
  content += `\n> 共 ${apis.length} 个接口`;
  fs.writeFileSync(MD_FILE, content, 'utf-8');
}

function loadApis() {
  try {
    if (fs.existsSync(APIS_FILE)) {
      return JSON.parse(fs.readFileSync(APIS_FILE, 'utf-8')).apis || [];
    }
  } catch (e) {}
  return [];
}

function saveApis(apis) {
  fs.writeFileSync(APIS_FILE, JSON.stringify({ apis, lastUpdated: new Date().toISOString() }, null, 2), 'utf-8');
  updateMarkdown(apis);
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/apis' && req.method === 'GET') {
    const apis = loadApis();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, apis }));
    return;
  }

  if (url.pathname === '/api/apis' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const apis = loadApis();
        const now = new Date().toISOString().split('T')[0];
        const parsed = parseCurl(data.curl || '');

        if (data.id) {
          const idx = apis.findIndex(a => a.id === data.id);
          if (idx !== -1) {
            apis[idx] = { ...apis[idx], ...data, method: parsed.method, url: parsed.url, headers: parsed.headers, updatedAt: now };
          }
        } else {
          apis.unshift({ id: Date.now().toString(), ...data, method: parsed.method, url: parsed.url, headers: parsed.headers, createdAt: now, updatedAt: now });
        }

        saveApis(apis);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  if (url.pathname.startsWith('/api/apis/') && req.method === 'DELETE') {
    const id = url.pathname.split('/').pop();
    const apis = loadApis();
    saveApis(apis.filter(a => a.id !== id));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
  if (!mimeTypes[ext]) filePath = path.join(__dirname, 'index.html');

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not Found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 API 管理系统已启动`);
  console.log(`📍 地址: http://localhost:${PORT}`);
  console.log(`📁 文档目录: ${DOC_DIR}`);
  console.log(`\n按 Ctrl+C 停止服务\n`);
  exec(`open http://localhost:${PORT}`);
});