// Script-to-Thumbnail — given a video script, return optimized title,
// description, and thumbnail concept tuned for crypto-native audiences.
//
// Returns { title, description, thumbnailConcept } as parsed JSON.
// If the model returns malformed JSON, returns { _raw, _parseFailed: true }
// so callers can decide whether to retry or display fallback UI.

export async function scriptToThumbnail(client, input) {
  if (!input?.script) {
    throw new Error('scriptToThumbnail: script is required');
  }

  const {
    script,
    creatorName,
    audienceTone = 'crypto-native',
    videoLengthMinutes,
  } = input;

  const lengthLine = videoLengthMinutes
    ? `~${videoLengthMinutes} minutes long`
    : 'unknown length';

  const creatorLine = creatorName
    ? `from creator ${creatorName}`
    : '';

  const question = `You are a YouTube/BoTTube thumbnail and metadata expert.

Given the following video script (${lengthLine}) ${creatorLine}, return a JSON object with exactly these three keys:

- "title": max 60 characters, optimized for ${audienceTone} viewers
- "description": 2-3 sentences ending with a clear call-to-action
- "thumbnailConcept": one sentence describing the thumbnail image, plus 3-5 word hook text that would appear on the thumbnail

Return ONLY the JSON object. No prose, no markdown code fences, no commentary.

Script:
"""
${script}
"""`;

  const response = await client.ask({
    question,
    contextInjection: {
      companyName: 'BoTTube',
      companyDescription: 'A video platform for crypto-native creators and audiences.',
      purpose: 'Help creators generate compelling titles, descriptions, and thumbnail concepts that perform well with crypto-savvy viewers.',
    },
  });

  return tryParseJSON(response);
}

function tryParseJSON(text) {
  // LLMs often wrap JSON in ```json ... ``` despite being told not to.
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return normalizeShape(parsed);
  } catch {
    return { _raw: text, _parseFailed: true };
  }
}

// LLMs drift on schemas. Accept common variants and normalize to the documented shape:
//   { title, description, thumbnailConcept }
function normalizeShape(parsed) {
  return {
    title: pickString(parsed, ['title', 'videoTitle', 'name']),
    description: pickString(parsed, ['description', 'videoDescription', 'desc', 'summary']),
    thumbnailConcept: pickThumbnail(parsed),
  };
}

function pickString(obj, keys) {
  for (const key of keys) {
    if (typeof obj[key] === 'string' && obj[key].length > 0) {
      return obj[key];
    }
  }
  return '';
}

function pickThumbnail(parsed) {
  // 1. Direct string at top level
  const direct = pickString(parsed, [
    'thumbnailConcept', 'thumbnail_concept', 'thumbnailDescription',
    'thumbnailText', 'thumbnail', 'thumbnailIdea', 'thumb',
    'image', 'imageConcept', 'imageDescription',
  ]);
  if (direct) return direct;

  // 2. Nested object under any thumbnail-related key — gather ALL string sub-values
  for (const key of Object.keys(parsed)) {
    if (!/thumb|image|cover/i.test(key)) continue;
    const nested = parsed[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      // Recursively gather all string leaves
      const parts = collectStrings(nested);
      if (parts.length > 0) return parts.join(' — ');
    }
  }

  return '';
}

function collectStrings(obj) {
  const out = [];
  if (typeof obj === 'string') {
    if (obj.length > 0) out.push(obj);
  } else if (Array.isArray(obj)) {
    for (const item of obj) out.push(...collectStrings(item));
  } else if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj)) out.push(...collectStrings(v));
  }
  return out;
}
