/**
 * Cloudflare Pages Function — /api/analyze
 * 环境变量在 Cloudflare Dashboard 中配置，不会暴露给用户
 */

const RATE_MAP = new Map();
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 60 * 1000;

function checkRate(ip) {
  const now = Date.now();
  const entry = RATE_MAP.get(ip) || { count: 0, start: now };
  if (now - entry.start > RATE_WINDOW) {
    RATE_MAP.set(ip, { count: 1, start: now });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  RATE_MAP.set(ip, entry);
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

function resolveProvider(env) {
  const priority = ['deepseek', 'openai', 'gemini', 'qwen', 'kimi', 'glm'];
  for (const p of priority) {
    if (env[PROVIDER_CONFIG[p].envKey]) return p;
  }
  return null;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  // 速率限制
  const ip = request.headers.get('CF-Connecting-IP') ||
             request.headers.get('X-Forwarded-For')?.split(',')[0] || 'unknown';
  if (!checkRate(ip)) {
    return new Response(
      JSON.stringify({ error: '请求太频繁，请 1 小时后再试 🙏' }),
      { status: 429, headers: CORS_HEADERS }
    );
  }

  // 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ error: '请求格式错误' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const { system, userText, images } = body || {};
  if (!system || !userText) {
    return new Response(
      JSON.stringify({ error: '缺少必要参数' }),
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // 找可用 Provider
  const providerKey = resolveProvider(env);
  if (!providerKey) {
    return new Response(
      JSON.stringify({ error: '服务暂未配置 API Key，请联系管理员' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const cfg = PROVIDER_CONFIG[providerKey];
  const apiKey = env[cfg.envKey];
  const model = env.AI_MODEL || cfg.defaultModel;

  // 构建消息内容
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
      return new Response(JSON.stringify({ error: msg }), { status: 502, headers: CORS_HEADERS });
    }

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: 'AI 返回内容为空' }), { status: 502, headers: CORS_HEADERS });
    }

    return new Response(JSON.stringify({ content }), { status: 200, headers: CORS_HEADERS });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: '网络请求失败：' + err.message }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
