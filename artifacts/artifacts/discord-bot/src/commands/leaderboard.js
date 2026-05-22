/**
 * commands/leaderboard.js
 *
 * Handles the /feedback-leaderboard slash command (admin-only).
 *
 * Shows the top 10 feedback submissions ranked by star rating, with a
 * select menu that lets admins click any member to read exactly what
 * they wrote in their review.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const { getLeaderboard, getUserFeedback } = require("../db");

// Custom ID for the select menu interaction
const SELECT_MENU_ID = "leaderboard_view";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const RANK_MEDAL = { 1: "🥇", 2: "🥈", 3: "🥉" };

function rankLabel(rank) {
  return RANK_MEDAL[rank] ?? `**${rank}.**`;
}

function starsEmoji(stars) {
  return "⭐".repeat(stars);
}

function starColor(stars) {
  return (
    { 1: 0xed4245, 2: 0xe67e22, 3: 0xfee75c, 4: 0x57f287, 5: 0x1abc9c }[
      stars
    ] ?? 0x5865f2
  );
}

// ─── /feedback-leaderboard ────────────────────────────────────────────────────

/**
 * Handle the /feedback-leaderboard slash command.
 */
async function handleLeaderboardCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "⛔ You need **Administrator** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer immediately — DB query follows
  await interaction.deferReply();

  const entries = await getLeaderboard(10);

  if (entries.length === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Feedback Leaderboard")
          .setDescription(
            "No feedback submissions yet. Use `/feedback` to be the first!"
          )
          .setColor(0x5865f2)
          .setTimestamp(),
      ],
    });
    return;
  }

  // Build ranked list for the embed description
  const lines = entries.map((entry, i) => {
    const rank = i + 1;
    return `${rankLabel(rank)} **${entry.username}** — ${starsEmoji(entry.stars)} **(${entry.stars}/5)**`;
  });

  const embed = new EmbedBuilder()
    .setTitle("🏆 Feedback Leaderboard")
    .setColor(0xf1c40f)
    .setDescription(lines.join("\n"))
    .setFooter({
      text: `Top ${entries.length} submission${entries.length !== 1 ? "s" : ""} · Use the menu below to read a member's full review`,
    })
    .setTimestamp();

  // Select menu — one option per leaderboard entry
  const options = entries.map((entry, i) => {
    const rank    = i + 1;
    const label   = entry.username.slice(0, 25);
    const desc    = `${RANK_MEDAL[rank] ?? `#${rank}`} ${starsEmoji(entry.stars)} — Click to read their review`;

    return new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(entry.user_id)
      .setDescription(desc.slice(0, 100));
  });

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(SELECT_MENU_ID)
    .setPlaceholder("👁️  Select a member to read their written feedback…")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ─── Select menu interaction ───────────────────────────────────────────────────

/**
 * Handle the leaderboard select menu interaction.
 * Fetches the chosen user's feedback from the DB and replies ephemerally.
 * Returns true if handled, false otherwise.
 */
async function handleLeaderboardSelect(interaction) {
  if (interaction.customId !== SELECT_MENU_ID) return false;

  const userId = interaction.values[0];

  // Defer ephemerally — DB query follows
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const feedback = await getUserFeedback(userId);

  if (!feedback) {
    await interaction.editReply({
      content:
        "⚠️ Could not find that member's feedback — it may have been reset by an admin.",
    });
    return true;
  }

  // Unix timestamp for Discord's relative time formatter
  const ts = Math.floor(new Date(feedback.created_at).getTime() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${feedback.username}'s Feedback`)
    .setColor(starColor(feedback.stars))
    .setDescription(`> ${feedback.reason.replace(/\n/g, "\n> ")}`)
    .addFields(
      {
        name: "⭐ Rating",
        value: `${starsEmoji(feedback.stars)} **(${feedback.stars}/5)**`,
        inline: true,
      },
      {
        name: "📅 Submitted",
        value: `<t:${ts}:R>`,
        inline: true,
      }
    )
    .setFooter({ text: `User ID: ${feedback.user_id}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
  return true;
}

module.exports = { handleLeaderboardCommand, handleLeaderboardSelect, SELECT_MENU_ID };
