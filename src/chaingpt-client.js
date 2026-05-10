// Thin wrapper around the ChainGPT GeneralChat SDK.
// Isolates the SDK so feature modules don't import it directly —
// makes it possible to swap providers, add caching, or mock for tests
// without touching feature code.

import { GeneralChat } from '@chaingpt/generalchat';

export class ChainGPTClient {
  constructor({ apiKey, defaultContext } = {}) {
    if (!apiKey) {
      throw new Error('ChainGPTClient: apiKey is required');
    }
    this._sdk = new GeneralChat({ apiKey });
    this._defaultContext = defaultContext;
  }

  async ask({ question, contextInjection, useDefaultContext = false, chatHistory = 'off' }) {
    if (!question || typeof question !== 'string') {
      throw new Error('ChainGPTClient.ask: question (string) is required');
    }

    const params = { question, chatHistory };
    if (contextInjection) {
      params.contextInjection = contextInjection;
    } else if (useDefaultContext) {
      params.useCustomContext = true;
    }

    const stream = await this._sdk.createChatStream(params);
    return await this._streamToString(stream);
  }

  _streamToString(stream) {
    return new Promise((resolve, reject) => {
      let result = '';
      stream.on('data', (chunk) => { result += chunk.toString(); });
      stream.on('end', () => resolve(result));
      stream.on('error', reject);
    });
  }
}
