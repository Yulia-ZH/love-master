/**
 * Netlify Serverless Function — /.netlify/functions/analyze
 * 前端通过 /api/analyze 调用（netlify.toml 做了重定向）
 */

const rateMap = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 60 * 1000;

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

function resolveProvider() {
  const priority = ['deepseek', 'openai', 'gemini', 'qwen', 'kimi', 'glm'];
  for (const p of priority) {
    if (process.env[PROVIDER_CONFIG[p].envKey]) return p;
  }
  return null;
}

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const ip = event.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  if (!checkRate(ip)) {
    return { statusCode: 429, headers, body: JSON.stringify({ error: '请求太频繁，请 1 小时后再试 🙏' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '请求格式错误' }) };
  }

  const { system, userText, images } = body;
  if (!system || !userText) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: '缺少必要参数' }) };
  }

  const providerKey = resolveProvider();
  if (!providerKey) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: '服务暂未配置 API Key，请联系管理员' }) };
  }

  const cfg = PROVIDER_CONFIG[providerKey];
  const apiKey = process.env[cfg.envKey];
  const model = process.env.AI_MODEL || cfg.defaultModel;

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
      return { statusCode: 502, headers, body: JSON.stringify({ error: msg }) };
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return { statusCode: 502, headers, body: JSON.stringify({ error: 'AI 返回内容为空' }) };

    return { statusCode: 200, headers, body: JSON.stringify({ content }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: '网络请求失败：' + err.message }) };
  }
};
