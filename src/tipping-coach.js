// Tipping Coach — when a viewer tips a creator, generate a warm, specific
// thank-you message that references the actual video and viewer context.
//
// Designed for video-platform integration (BoTTube as reference), but the
// inputs are platform-agnostic — any creator economy can use this.

const REQUIRED = ['creatorName', 'videoTitle', 'tipAmount'];

export async function tippingCoach(client, input) {
  for (const field of REQUIRED) {
    if (!input[field]) {
      throw new Error(`tippingCoach: ${field} is required`);
    }
  }

  const {
    creatorName,
    videoTitle,
    videoTopic,
    tipAmount,
    tipCurrency = 'CGPT',
    viewerName,
    viewerHistory,
  } = input;

  const viewerRef = viewerName || 'a viewer';
  const topicLine = videoTopic ? ` (about ${videoTopic})` : '';
  const historyLine = viewerHistory ? ` This viewer has previously: ${viewerHistory}.` : '';

  const question = [
    `Generate a warm, specific 1-2 sentence thank-you message that ${creatorName} could send to ${viewerRef}`,
    `who just tipped ${tipAmount} ${tipCurrency} after watching their video "${videoTitle}"${topicLine}.`,
    historyLine,
    `Reference the specific video topic. Avoid generic AI phrases like "your support means the world to me" or "motivates me to create even more valuable content".`,
    `Sound like a real creator, not a chatbot. Return only the thank-you message, no preamble or quotes.`,
  ].join(' ').trim();

  const response = await client.ask({
    question,
    contextInjection: {
      companyName: 'BoTTube',
      companyDescription: 'A video platform with on-chain tipping in CGPT and RTC.',
      purpose: 'Help creators write specific, warm thank-you messages to viewers who tip them.',
      cryptoToken: true,
      tokenInformation: {
        tokenName: 'ChainGPT',
        tokenSymbol: 'CGPT',
      },
    },
  });

  return cleanResponse(response);
}

function cleanResponse(text) {
  return text
    .trim()
    .replace(/^["'`](.*)["'`]$/s, '$1')  // strip wrapping quotes
    .trim();
}
