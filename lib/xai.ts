import { env } from "cloudflare:workers";

export type HotPost = {
  rank: number;
  author: string;
  postedAt: string;
  url: string;
  original: string;
  chinese: string;
  engagement?: string;
};

export type NarrativeResult = {
  aiAnalysis: string;
  posts: HotPost[];
  raw: string;
};

function apiKey() {
  const value = (env as unknown as Record<string, unknown>).XAI_API_KEY;
  if (typeof value !== "string" || !value) throw new Error("XAI_API_KEY 未配置");
  return value;
}

function extractText(payload: Record<string, unknown>): string {
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? ((item as Record<string, unknown>).content as unknown[])
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return (part as Record<string, unknown>).text as string;
      }
    }
  }
  return "";
}

function parseJson(text: string): Record<string, unknown> {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    return JSON.parse(clean) as Record<string, unknown>;
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    return match ? (JSON.parse(match[0]) as Record<string, unknown>) : {};
  }
}

export async function analyzeNarrative(input: {
  chain: string;
  address: string;
  symbol: string;
  name: string;
}): Promise<NarrativeResult> {
  const prompt = `你是加密资产社媒研究员。只执行一次X搜索，禁止读取帖子线程，禁止第二次搜索。
搜索最近48小时与以下代币明确相关的热门原创帖子，排除转推、重复喊单、机器人水文和同名无关项目：
链：${input.chain}
合约：${input.address}
名称：${input.name}
代码：$${input.symbol}

综合相关性、点赞、转发、回复、浏览和作者影响力，最多选择3条。若有效帖子不足3条，按实际数量返回，不能用无关内容补齐。
严格只输出JSON：
{"ai_analysis":"40至80个中文汉字，最多两句，概括核心叙事并指出一个关键利好或风险","posts":[{"rank":1,"author":"@账号","posted_at":"ISO时间或空字符串","url":"原帖完整URL","original":"原帖核心内容，最多180字","chinese":"简短中文翻译或摘要，最多80字","engagement":"可获得的互动数据或空字符串"}]}`;

  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.20-0309-non-reasoning",
      input: prompt,
      tools: [{ type: "x_search" }],
      max_tool_calls: 1,
      max_output_tokens: 700,
      temperature: 0.2,
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`xAI HTTP ${response.status}`);
  const raw = extractText(payload);
  const parsed = parseJson(raw);
  const posts = Array.isArray(parsed.posts)
    ? parsed.posts.slice(0, 3).map((post, index) => {
        const row = (post && typeof post === "object" ? post : {}) as Record<string, unknown>;
        return {
          rank: index + 1,
          author: String(row.author ?? "未知作者"),
          postedAt: String(row.posted_at ?? ""),
          url: String(row.url ?? ""),
          original: String(row.original ?? "").slice(0, 500),
          chinese: String(row.chinese ?? "").slice(0, 240),
          engagement: String(row.engagement ?? ""),
        };
      })
    : [];
  return {
    aiAnalysis: String(parsed.ai_analysis ?? "暂未形成清晰叙事，等待更多有效讨论。").slice(0, 240),
    posts,
    raw,
  };
}

