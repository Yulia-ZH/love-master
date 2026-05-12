# 💗 恋爱大师 · AI 感情分析工具

一个免费开放给所有人使用的 AI 感情分析工具，用户无需填写任何 API Key。

## 部署到 Vercel（5 分钟完成）

### 第一步：上传到 GitHub

```bash
cd /Users/yuhong/Desktop/love-master

git init
git add .
git commit -m "🌹 初始化恋爱大师"

# 在 github.com/new 创建仓库后执行：
git remote add origin https://github.com/你的用户名/love-master.git
git branch -M main
git push -u origin main
```

### 第二步：部署到 Vercel

1. 打开 [vercel.com](https://vercel.com) → 用 GitHub 账号登录
2. 点击 **Add New Project** → 选择 `love-master` 仓库 → **Deploy**
3. 部署成功后，进入项目 → **Settings** → **Environment Variables**
4. 添加以下环境变量（至少填一个）：

| 变量名 | 说明 | 获取地址 |
|--------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek（推荐，最便宜） | [platform.deepseek.com](https://platform.deepseek.com/api_keys) |
| `OPENAI_API_KEY` | OpenAI GPT | [platform.openai.com](https://platform.openai.com/api-keys) |
| `GEMINI_API_KEY` | Google Gemini（有免费额度） | [aistudio.google.com](https://aistudio.google.com/app/apikey) |
| `QWEN_API_KEY` | 通义千问（国内直连） | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com/apiKey) |
| `KIMI_API_KEY` | Kimi 月之暗面（国内直连） | [platform.moonshot.cn](https://platform.moonshot.cn/console/api-keys) |
| `GLM_API_KEY` | 智谱 GLM（有免费额度） | [open.bigmodel.cn](https://open.bigmodel.cn/usercenter/apikeys) |

5. 添加完环境变量后，点击 **Redeploy** 重新部署一次
6. 完成！你的网址是 `https://love-master-xxx.vercel.app`

### 可选：指定使用的模型

在环境变量中添加 `AI_MODEL`，例如：
- `deepseek-chat`（DeepSeek V3，默认）
- `gpt-4o`（OpenAI）
- `gemini-2.5-flash`（Gemini）

## 费用参考（DeepSeek）

| 使用量 | 预估费用 |
|--------|----------|
| 100 次分析 | ≈ ¥0.5 |
| 1000 次分析 | ≈ ¥5 |
| 10000 次分析 | ≈ ¥50 |

## 防滥用机制

- 每个 IP 每小时最多请求 10 次
- 可在 `api/analyze.js` 中调整 `RATE_LIMIT` 参数

## 项目结构

```
love-master/
├── index.html        # 前端页面（用户看到的）
├── api/
│   └── analyze.js    # 后端函数（API Key 藏在这里）
├── vercel.json       # Vercel 配置
└── README.md
```
