/**
 * Vercel Serverless Function — /api/analyze
 * 
 * 接收前端请求，用环境变量里的 API Key 调用 AI，返回分析结果。
 * Key 永远不会暴露给用户。
 */

// ── 速率限制（简单内存版，防止滥用）──
const rateMap = new Map();
const RATE_LIMIT = 10;        // 每个 IP 每小时最多 10 次
const RATE_WINDOW = 60 * 60 * 1000; // 1 小时

function checkRate(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    rateMap.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  rateMap.set(ip, entry);
  return true;
}

// ── 支持的 Provider 配置 ──
const PROVIDER_CONFIG = {
  deepseek: {
    endpoint: 'https://api.deepseek.com/chat/completions',
    envKey: 'DEEPSEEK_API_KEY',
    defaultModel: 'deepseek-chat',
  },
  openai: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    envKey: 'OPENAI_API_KEY',
    defaultModel: 'gpt-4o',
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    envKey: 'GEMINI_API_KEY',
    defaultModel: 'gemini-2.5-flash',
  },
  qwen: {
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    envKey: 'QWEN_API_KEY',
    defaultModel: 'qwen-plus',
  },
  kimi: {
    endpoint: 'https://api.moonshot.cn/v1/chat/completions',
    envKey: 'KIMI_API_KEY',
    defaultModel: 'moonshot-v1-32k',
  },
  glm: {
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    envKey: 'GLM_API_KEY',
    defaultModel: 'glm-4',
  },
};

// ── 决定使用哪个 Provider ──
function resolveProvider() {
  // 按优先级找第一个配置了 Key 的 Provider
  const priority = ['deepseek', 'openai', 'gemini', 'qwen', 'kimi', 'glm'];
  for (const p of priority) {
    if (process.env[PROVIDER_CONFIG[p].envKey]) return p;
  }
  return null;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 速率限制
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown';
  if (!checkRate(ip)) {
    return res.status(429).json({ error: '请求太频繁，请 1 小时后再试 🙏' });
  }

  // 解析请求体
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: '请求格式错误' });
  }

  const { system, userText, images } = body || {};
  if (!system || !userText) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  // 找可用 Provider
  const providerKey = resolveProvider();
  if (!providerKey) {
    return res.status(500).json({ error: '服务暂未配置 API Key，请联系管理员' });
  }

  const cfg = PROVIDER_CONFIG[providerKey];
  const apiKey = process.env[cfg.envKey];
  const model = process.env.AI_MODEL || cfg.defaultModel;

  // 构建消息
  let userContent;
  if (images && images.length > 0) {
    userContent = [
      { type: 'text', text: userText },
      ...images.map(img => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: 'high' }
      }))
    ];
  } else {
    userContent = userText;
  }

  // 调用 AI
  try {
    const aiRes = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        temperature: 0.85,
        max_tokens: 2500,
      }),
    });

    if (!aiRes.ok) {
      let msg = `AI 服务错误 (${aiRes.status})`;
      try { const d = await aiRes.json(); msg = d.error?.message || msg; } catch (_) {}
      return res.status(502).json({ error: msg });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'AI 返回内容为空' });

    return res.status(200).json({ content });
  } catch (err) {
    return res.status(500).json({ error: '网络请求失败：' + err.message });
  }
}
