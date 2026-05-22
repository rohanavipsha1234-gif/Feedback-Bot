/**
 * deploy-commands.js
 *
 * Run this script ONCE to register slash commands with Discord.
 * Usage: node src/deploy-commands.js
 *
 * You only need to re-run this when you add or change slash commands.
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { REST, Routes, PermissionFlagsBits, ApplicationCommandOptionType } = require("discord.js");

const { GUILD_CONFIGS } = require("./guild-config");

// ─── Validate required env vars ───────────────────────────────────────────────
const { BOT_TOKEN, CLIENT_ID } = process.env;

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error(
    "❌  Missing BOT_TOKEN or CLIENT_ID in your .env file.\n" +
      "    Copy .env.example → .env and fill in the values."
  );
  process.exit(1);
}

// ─── Command definitions ───────────────────────────────────────────────────────
const commands = [
  {
    name: "feedback",
    description: "Share your feedback about the server before you leave.",
  },
  {
    name: "feedback-stats",
    description: "View an aggregate summary of all server feedback ratings. (Admin only)",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
  },
  {
    name: "feedback-leaderboard",
    description: "View the top feedback submissions ranked by star rating. (Admin only)",
    default_member_permissions: String(PermissionFlagsBits.Administrator),
  },
  {
    name: "reset",
    description: "Reset a member's feedback so they can submit a new review. (Admin only)",
    // Discord hides this command from non-admins in the UI automatically
    default_member_permissions: String(PermissionFlagsBits.Administrator),
    options: [
      {
        name: "member",
        description: "The member whose feedback record you want to reset.",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },
];

// ─── Register commands via Discord REST API ────────────────────────────────────
// Registers commands for every guild listed in guild-config.js instantly.
const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);

(async () => {
  const guildIds = Object.keys(GUILD_CONFIGS);

  for (const guildId of guildIds) {
    try {
      console.log(`🔄  Registering commands for guild ${guildId}...`);
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, guildId),
        { body: commands }
      );
      console.log(`✅  Done — guild ${guildId}`);
    } catch (error) {
      console.error(`❌  Failed for guild ${guildId}:`, error.message);
    }
  }

  console.log("\n🎉  All guilds registered!");
})();
