/**
 * Social media content generator — reads the latest daily digests and
 * uses LLM to produce platform-specific articles for Xiaohongshu and
 * WeChat Official Account.
 *
 * Usage:
 *   pnpm xiaohongshu          # generates ai-xiaohongshu.md
 *   pnpm wechat               # generates ai-wechat.md
 *
 * Reads API keys from .env (local only).
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { callLlm, saveFile } from "./report.ts";

const DIGESTS_DIR = "digests";

// Reports to include as source material (zh only)
const SOURCE_REPORTS = ["ai-cli", "ai-agents", "ai-web", "ai-trending", "ai-hn"];

function getLatestDate(): string {
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const dates = fs
    .readdirSync(DIGESTS_DIR)
    .filter((d) => dateRe.test(d) && fs.statSync(path.join(DIGESTS_DIR, d)).isDirectory())
    .sort()
    .reverse();
  if (!dates[0]) throw new Error("No digest directories found");
  return dates[0];
}

function loadReports(date: string): string {
  const sections: string[] = [];
  for (const report of SOURCE_REPORTS) {
    const filePath = path.join(DIGESTS_DIR, date, `${report}.md`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf-8");
      // Truncate each report to keep total prompt size manageable
      sections.push(`## [${report}]\n\n${content.slice(0, 3000)}`);
    }
  }
  if (sections.length === 0) throw new Error(`No reports found for ${date}`);
  return sections.join("\n\n---\n\n");
}

function buildXiaohongshuPrompt(reports: string, date: string): string {
  return `你是一位擅长小红书内容创作的 AI 科技博主，风格活泼有趣、善用 emoji，能把技术动态写得让普通读者也爱看。

以下是 ${date} 的 AI 生态日报原始内容：

${reports}

---

请基于以上内容，生成一篇小红书笔记，要求：

**标题**：吸睛、有信息量，15-25 字，可用 emoji 开头

**正文**（500-1000 字）：
1. 开头用 1-2 句话抓住读者注意力（今天 AI 圈发生了什么大事）
2. 精选 5-8 个最值得关注的亮点，每个亮点：
   - 用 emoji 做小标题
   - 2-3 句话讲清楚发生了什么、为什么重要
   - 口语化但不失专业，像在跟朋友聊天
3. 结尾用 1-2 句话总结趋势或给出观点
4. 最后加 3-5 个相关话题标签（#AI #开源 等）

**风格要求**：
- 多用 emoji 做视觉分隔（但不要堆砌）
- 段落短小，适合手机阅读
- 避免过于技术化的术语，或者用括号简单解释
- 有自己的观点和态度，不要纯搬运
- 不要加任何链接（小红书不支持外链）

直接输出标题和正文，不要加额外说明。`;
}

function buildWechatPrompt(reports: string, date: string): string {
  return `你是一位专注 AI 领域的公众号作者，文风专业但可读性强，擅长把复杂的技术动态梳理成结构清晰、有深度的长文。

以下是 ${date} 的 AI 生态日报原始内容：

${reports}

---

请基于以上内容，生成一篇微信公众号文章，要求：

**标题**：专业有力，20-35 字，体现当日核心看点

**正文**（2000-3000 字）：

1. **导语**（100-150 字）：概括今日 AI 领域最重要的 3-5 件事，建立阅读预期

2. **AI CLI 工具动态**：各主流 AI 编程工具的最新进展
   - 重点关注版本发布、重要 PR、社区讨论
   - 简要对比各工具的发展方向

3. **AI Agent 生态**：Agent 框架和项目的关键动向
   - 新功能、新项目、生态合作
   - 行业趋势判断

4. **开源趋势与社区热点**：GitHub Trending 和 Hacker News 的重要信号
   - 热门项目和技术方向
   - 社区讨论的核心话题和情绪

5. **官方动态**（如有）：Anthropic、OpenAI 等公司的最新发布

6. **今日观点**（200-300 字）：基于以上信息，给出你的判断
   - 值得关注的趋势信号
   - 对开发者的建议
   - 展望短期可能的变化

**风格要求**：
- 专业但不晦涩，面向有一定技术背景的读者
- 使用 Markdown 格式，包括标题层级、加粗、列表
- 每个章节之间用分隔线（---）隔开
- 关键数据（star 数、版本号等）要保留
- 结尾附注：数据来源为 agents-radar 项目（https://github.com/duanyytop/agents-radar）

直接输出标题和正文，不要加额外说明。`;
}

type Platform = "xiaohongshu" | "wechat";

async function generate(platform: Platform): Promise<void> {
  const date = getLatestDate();
  const reports = loadReports(date);

  const prompt =
    platform === "xiaohongshu" ? buildXiaohongshuPrompt(reports, date) : buildWechatPrompt(reports, date);

  const maxTokens = platform === "xiaohongshu" ? 4096 : 8192;

  console.log(`[social] Generating ${platform} article for ${date}…`);
  const content = await callLlm(prompt, maxTokens);

  const filename = platform === "xiaohongshu" ? "ai-xiaohongshu.md" : "ai-wechat.md";
  const filepath = saveFile(content, date, filename);
  console.log(`[social] Saved to ${filepath}`);
}

const platform = process.argv[2] as Platform | undefined;
if (!platform || !["xiaohongshu", "wechat"].includes(platform)) {
  console.error("Usage: tsx src/social.ts <xiaohongshu|wechat>");
  process.exit(1);
}

generate(platform).catch((e: unknown) => {
  console.error("[social]", e instanceof Error ? e.message : e);
  process.exit(1);
});
