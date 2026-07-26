/**
 * guild-config.js
 *
 * Per-server configuration.
 *
 * Simply add a new server below when inviting the bot.
 *
 * Format:
 *
 * "<GUILD_ID>": {
 *     feedbackChannel: "<CHANNEL_ID>",
 *     completionChannel: "<CHANNEL_ID>",
 * }
 */

const GUILD_CONFIGS = {

  //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Sasaki Community
  //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "1430467213827244167": {
    feedbackChannel: "1520298730031415366",
    completionChannel: "1520299342316044448",
  },

  //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Another Server
  //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "1296182525034762240": {
    feedbackChannel: "1530996665463472359",
    completionChannel: "1530996147764592761",
  },
  
  //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Another Server
  //━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  "1490917538014691459": {
    feedbackChannel: "1505451145919860746",
    completionChannel: "1505451145919860746",
  },


};

/**
 * Get the full configuration for a guild.
 *
 * @param {string} guildId
 * @returns {{
 *   feedbackChannel: string|null,
 *   completionChannel: string|null,
 * }}
 */
function getGuildConfig(guildId) {
  return (
    GUILD_CONFIGS[guildId] ?? {
      feedbackChannel: process.env.FEEDBACK_CHANNEL_ID ?? null,
      completionChannel: process.env.COMPLETION_CHANNEL_ID ?? null,
    }
  );
}

/**
 * Returns only the feedback channel.
 */
function getFeedbackChannelId(guildId) {
  return getGuildConfig(guildId).feedbackChannel;
}

/**
 * Returns the completion message channel.
 */
function getCompletionChannelId(guildId) {
  return getGuildConfig(guildId).completionChannel;
}

module.exports = {
  GUILD_CONFIGS,
  getGuildConfig,
  getFeedbackChannelId,
  getCompletionChannelId,
};
