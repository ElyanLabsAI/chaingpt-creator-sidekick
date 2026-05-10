// News Brief — fetch recent crypto news from ChainGPT AI News, then use
// GeneralChat to summarize into a daily creator brief: top stories + suggested
// video angles for crypto-native creators.
//
// Designed for Sophiacord daily-brief deployment OR direct creator dashboard.

import { AINews } from '@chaingpt/ainews';

export class NewsBrief {
  constructor({ apiKey, chatClient }) {
    if (!apiKey) throw new Error('NewsBrief: apiKey required');
    if (!chatClient) throw new Error('NewsBrief: chatClient (ChainGPTClient) required');
    this._news = new AINews({ apiKey });
    this._chat = chatClient;
  }

  // Fetch latest news items, optionally filtered.
  async fetchNews({ limit = 10, searchQuery, categoryId, subCategoryId, tokenId } = {}) {
    const findNewsDto = { limit, sortBy: 'createdAt' };
    if (searchQuery) findNewsDto.searchQuery = searchQuery;
    if (categoryId) findNewsDto.categoryId = categoryId;
    if (subCategoryId) findNewsDto.subCategoryId = subCategoryId;
    if (tokenId) findNewsDto.tokenId = tokenId;

    const response = await this._news.getNews(findNewsDto);
    return normalizeNewsResponse(response);
  }

  // Compose a creator-friendly brief from raw news items.
  async createBrief({ items, audience = 'crypto-native creators', maxItems = 5 }) {
    if (!items || items.length === 0) {
      throw new Error('createBrief: items array required');
    }

    // Truncate to keep prompt under model context. ChainGPT chat seems to fail
    // (with masked SDK error) on very long inputs.
    const itemSummary = items.slice(0, maxItems).map((item, i) => {
      const title = (item.title || '[no title]').slice(0, 200);
      const desc = (item.description || item.summary || '').slice(0, 300);
      return `${i + 1}. ${title}\n   ${desc}`;
    }).join('\n\n');

    const question = `Below are recent crypto news headlines. Produce a daily brief for ${audience} with this exact structure:

**Top 3 stories** (ranked by importance):
1. [headline] — [1-sentence why-it-matters]
2. [headline] — [1-sentence why-it-matters]
3. [headline] — [1-sentence why-it-matters]

**Suggested video angles** (3 specific topics a creator could film today):
- [angle 1, 1 sentence]
- [angle 2, 1 sentence]
- [angle 3, 1 sentence]

Be concrete. No filler.

News items:
${itemSummary}`;

    try {
      const response = await this._chat.ask({
        question,
        contextInjection: {
          companyName: 'BoTTube',
          purpose: 'Help crypto-native video creators identify newsworthy topics and suggest video angles.',
        },
      });
      return response.trim();
    } catch (err) {
      // ChainGPT GeneralChat SDK has a buggy error handler that crashes on
      // certain failures. Surface a useful error rather than the SDK's TypeError.
      if (err.message?.includes('Cannot read properties of undefined')) {
        throw new Error(`ChainGPT GeneralChat call failed (SDK error handler bug masked the real cause). Try fewer items or a shorter prompt. Original: ${err.message}`);
      }
      throw err;
    }
  }

  // Convenience: fetch + brief in one call.
  async dailyBrief({ limit = 10, searchQuery, audience } = {}) {
    const items = await this.fetchNews({ limit, searchQuery });
    if (items.length === 0) {
      return { items: [], brief: '(no news items returned)' };
    }
    const brief = await this.createBrief({ items, audience });
    return { items, brief };
  }
}

function normalizeNewsResponse(response) {
  // ChainGPT's news response shape varies; try common locations
  if (Array.isArray(response)) return response;
  if (response?.data?.rows) return response.data.rows;
  if (response?.data) return Array.isArray(response.data) ? response.data : [];
  if (response?.rows) return response.rows;
  if (response?.items) return response.items;
  return [];
}
