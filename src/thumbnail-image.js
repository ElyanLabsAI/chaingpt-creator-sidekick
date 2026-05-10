// Thumbnail Image — chains scriptToThumbnail (concept text) into NFT API
// generateImage (actual PNG) so creators get a real thumbnail file, not just
// a description.
//
// Models available: 'velogen' (cheap proprietary), 'nebula_forge_xl',
// 'VisionaryForge', 'Dale3' (DALL·E 3, pricier).
//
// Outputs the image bytes; caller decides whether to save to disk, base64,
// upload to CDN, etc.

import { Nft } from '@chaingpt/nft';
import { scriptToThumbnail } from './script-to-thumbnail.js';

export class ThumbnailImage {
  constructor({ apiKey, walletAddress, chatClient, defaultModel = 'velogen' }) {
    if (!apiKey) throw new Error('ThumbnailImage: apiKey required');
    if (!walletAddress) throw new Error('ThumbnailImage: walletAddress required (the NFT API needs a target wallet for generation)');
    if (!chatClient) throw new Error('ThumbnailImage: chatClient (ChainGPTClient) required');

    this._nft = new Nft({ apiKey });
    this._chat = chatClient;
    this._walletAddress = walletAddress;
    this._defaultModel = defaultModel;
  }

  // Take a script, get the thumbnail concept, then generate the image.
  // Returns { concept: { title, description, thumbnailConcept }, image: <result>, prompt }
  async fromScript({ script, creatorName, audienceTone, videoLengthMinutes, model, width = 1024, height = 1024 }) {
    if (!script) throw new Error('ThumbnailImage.fromScript: script required');

    // Step 1 — get the thumbnail concept from script-to-thumbnail
    const concept = await scriptToThumbnail(this._chat, {
      script,
      creatorName,
      audienceTone,
      videoLengthMinutes,
    });

    if (!concept.thumbnailConcept) {
      throw new Error('ThumbnailImage.fromScript: scriptToThumbnail returned no thumbnailConcept');
    }

    // Step 2 — build a clean image-generation prompt from the concept
    const imagePrompt = this._buildImagePrompt(concept, audienceTone);

    // Step 3 — generate
    const image = await this._nft.generateImage({
      walletAddress: this._walletAddress,
      prompt: imagePrompt,
      model: model || this._defaultModel,
      width,
      height,
    });

    return { concept, image, prompt: imagePrompt };
  }

  // Direct image generation from a prompt (no script step).
  async fromPrompt({ prompt, model, width = 1024, height = 1024 }) {
    if (!prompt) throw new Error('ThumbnailImage.fromPrompt: prompt required');

    const image = await this._nft.generateImage({
      walletAddress: this._walletAddress,
      prompt,
      model: model || this._defaultModel,
      width,
      height,
    });

    return { image, prompt };
  }

  _buildImagePrompt(concept, audienceTone = 'crypto-native') {
    const { title, thumbnailConcept } = concept;
    return `YouTube thumbnail for video "${title}". ${thumbnailConcept}. High contrast, bold composition, ${audienceTone} aesthetic. No watermark, no signature.`.replace(/\s+/g, ' ').trim();
  }
}
