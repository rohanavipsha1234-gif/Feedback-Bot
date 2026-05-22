/**
 * index.js — Discord Feedback Bot
 *
 * Entry point. Creates the Discord client, registers event listeners,
 * and logs in using the token from .env.
 *
 * ─── Setup checklist ──────────────────────────────────────────────────────────
 *   1. Copy .env.example → .env and fill in:
 *        BOT_TOKEN          — your bot token (Discord Developer Portal → Bot)
 *        CLIENT_ID          — your application ID (Discord Developer Portal → General)
 *        FEEDBACK_CHANNEL_ID — the channel where feedback embeds will be posted
 *
 *   2. Register slash commands (run ONCE, then again only when you change commands):
 *        node src/deploy-commands.js
 *
 *   3. Start the bot:
 *        node src/index.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const { Client, GatewayIntentBits, MessageFlags } = require("discord.js");

const {
  handleFeedbackCommand,
  handleButtonInteraction,
  handleModalSubmit,
} = require("./commands/feedback");

const { handleStatsCommand } = require("./commands/stats");
const { handleResetCommand } = require("./commands/reset");
const {
  handleLeaderboardCommand,
  handleLeaderboardSelect,
} = require("./commands/leaderboard");
const { warmup, deleteUserFeedback } = require("./db");
const { getFeedbackChannelId } = require("./guild-config");

// ─── Validate required environment variables ───────────────────────────────────
const { BOT_TOKEN } = process.env;

if (!BOT_TOKEN) {
  console.error(
    "❌  BOT_TOKEN is missing.\n" +
      "    Copy .env.example → .env and add your bot token.",
  );
  process.exit(1);
}

// ─── Create the Discord client ────────────────────────────────────────────────
// GuildMembers is a PRIVILEGED intent. It requires manual activation in the
// Discord Developer Portal before the bot can request it:
//   discord.com/developers/applications → Your App → Bot
//   → Privileged Gateway Intents → Server Members Intent → toggle ON → Save
// Once enabled there, change the intents array below to:
//   [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
const client = new Client({
  intents: [GatewayIntentBits.Guilds], // add GatewayIntentBits.GuildMembers after enabling in portal
});

// ─── Ready event ──────────────────────────────────────────────────────────────
client.once("ready", async (c) => {
  console.log(`✅  Logged in as ${c.user.tag}`);
  console.log("    Commands: /feedback  /feedback-stats  /reset");
  console.log(
    "    Serving guilds:",
    Object.keys(require("./guild-config").GUILD_CONFIGS).join(", "),
  );
  // Pre-warm the DB pool so the first user interaction is never slow
  await warmup();
});

// ─── Interaction handler ───────────────────────────────────────────────────────
client.on("interactionCreate", async (interaction) => {
  try {
    // ── Slash commands ───────────────────────────────────────────────────────
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "feedback") {
        await handleFeedbackCommand(interaction);
      } else if (interaction.commandName === "feedback-stats") {
        await handleStatsCommand(interaction);
      } else if (interaction.commandName === "reset") {
        await handleResetCommand(interaction);
      } else if (interaction.commandName === "feedback-leaderboard") {
        await handleLeaderboardCommand(interaction);
      }
      return;
    }

    // ── Button interactions ──────────────────────────────────────────────────
    if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
      return;
    }

    // ── Select menu interactions ─────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      await handleLeaderboardSelect(interaction);
      return;
    }

    // ── Modal submissions ────────────────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      // Look up the correct feedback channel for whichever server this came from
      const channelId = getFeedbackChannelId(interaction.guildId);
      if (!channelId) {
        await interaction.reply({
          content: "⚠️ This server is not configured for feedback yet.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await handleModalSubmit(interaction, channelId);
      return;
    }
  } catch (error) {
    // Log the error and try to inform the user without crashing the bot
    console.error("[interactionCreate] Unhandled error:", error);

    const reply = {
      content: "⚠️ Something went wrong. Please try again.",
      flags: MessageFlags.Ephemeral,
    };

    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(reply);
      } else {
        await interaction.reply(reply);
      }
    } catch {
      // Ignore follow-up errors — the original error is already logged above
    }
  }
});

// ─── Member leave handler ──────────────────────────────────────────────────────
// When a member leaves (or is kicked/banned), delete their feedback record so
// they can submit a fresh review if they ever rejoin the server.
// Requires the "Server Members Intent" privileged intent to be enabled in the
// Discord Developer Portal.
client.on("guildMemberRemove", async (member) => {
  try {
    await deleteUserFeedback(member.user.id);
    console.log(
      `🗑️  Cleared feedback for ${member.user.tag} (left the server)`,
    );
  } catch (err) {
    console.error(
      `[guildMemberRemove] Failed to clear feedback for ${member.user.id}:`,
      err,
    );
  }
});

// ─── Keep-Alive Web Server ─────────────────────────────────────────────────────
//
// Why this exists:
//   Replit free-tier workspaces sleep after ~1 hour of inactivity, which kills
//   the Discord bot. Running a minimal Express HTTP server allows an external
//   uptime monitor to ping this URL on a regular interval, keeping the workspace
//   — and therefore the bot — alive around the clock.
//
// How uptime monitoring works:
//   UptimeRobot (or any similar service) sends a GET request to this server
//   every 5 minutes. As long as the server responds, Replit treats the workspace
//   as active and does not put it to sleep.
//
// UptimeRobot setup (https://uptimerobot.com — free tier is sufficient):
//   1. Copy your Replit project's public URL
//      e.g. https://your-repl-name.replit.dev
//   2. Log in to UptimeRobot → click "New Monitor"
//   3. Monitor Type : HTTP(s)
//   4. Friendly Name: Discord Feedback Bot
//   5. URL          : <paste your Replit URL here>
//   6. Monitoring Interval: every 5 minutes
//   7. Click "Create Monitor"
//
//   UptimeRobot will immediately start pinging the URL. If it ever goes down
//   you will receive an alert email.
// ───────────────────────────────────────────────────────────────────────────────

const express = require("express");
const keepAliveApp = express();
const KEEP_ALIVE_PORT = process.env.PORT || 3000;

keepAliveApp.get("/", (_req, res) => {
  res.send("Bot is alive!");
});

keepAliveApp.listen(KEEP_ALIVE_PORT, () => {
  console.log(`🌐  Web server started on port ${KEEP_ALIVE_PORT}`);
});

// ─── Login ─────────────────────────────────────────────────────────────────────
client.login(BOT_TOKEN);
