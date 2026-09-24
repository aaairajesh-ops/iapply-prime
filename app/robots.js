// Internal tool: search engines may not index or follow anything. Link-preview
// bots are let in so a shared institution link shows its thumbnail in
// WhatsApp, Facebook, LinkedIn, Telegram, X and Slack.
const PREVIEW_BOTS = ['WhatsApp', 'facebookexternalhit', 'Facebot', 'meta-externalagent', 'LinkedInBot', 'TelegramBot', 'Twitterbot', 'Slackbot', 'Slackbot-LinkExpanding', 'Discordbot', 'SkypeUriPreview'];

export default function robots() {
  return {
    rules: [
      { userAgent: PREVIEW_BOTS, allow: '/' },
      { userAgent: '*', disallow: '/' },
    ],
  };
}
