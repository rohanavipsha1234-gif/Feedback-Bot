/**
 * guild-config.js
 *
 * Maps each Discord server (guild) the bot is in to its feedback channel.
 * Add a new entry here whenever you invite the bot to a new server.
 *
 * Format:
 *   "<GUILD_ID>": "<FEEDBACK_CHANNEL_ID>"
 */

const GUILD_CONFIGS = {
  // Server 1
  "1490917538014691459": "1530641448469266612",

  // Server 2
  "1430467213827244167": "1520298730031415366",
};

/**
 * Get the feedback channel ID for a given guild.
 * Falls back to the FEEDBACK_CHANNEL_ID env var for single-server setups.
 * @param {string} guildId
 * @returns {string|null}
 */
function getFeedbackChannelId(guildId) {
  return GUILD_CONFIGS[guildId] ?? process.env.FEEDBACK_CHANNEL_ID ?? null;
}

module.exports = { GUILD_CONFIGS, getFeedbackChannelId };
