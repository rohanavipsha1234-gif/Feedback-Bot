/**
 * commands/leaderboard.js
 *
 * Handles the /feedback-leaderboard slash command.
 *
 * • Shows every feedback submission for the current server.
 * • Rankings are sorted by stars, then oldest submission first.
 * • Admins can select a member to read their full review.
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

const SELECT_MENU_ID = "leaderboard_view";

const RANK_MEDAL = {
  1: "🥇",
  2: "🥈",
  3: "🥉",
};

function rankLabel(rank) {
  return RANK_MEDAL[rank] ?? `**${rank}.**`;
}

function starsEmoji(stars) {
  return "⭐".repeat(stars);
}

function starColor(stars) {
  return (
    {
      1: 0xed4245,
      2: 0xe67e22,
      3: 0xfee75c,
      4: 0x57f287,
      5: 0x1abc9c,
    }[stars] ?? 0x5865f2
  );
}

/*──────────────────────────────────────────────*/

async function handleLeaderboardCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: "⛔ You need **Administrator** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply();

  // Fetch ALL feedback for this guild
  const entries = await getLeaderboard(interaction.guild.id);

  if (!entries.length) {
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("🏆 Feedback Leaderboard")
          .setColor(0x5865f2)
          .setDescription(
            "No feedback has been submitted in this server yet."
          )
          .setTimestamp(),
      ],
    });
  }

  const lines = entries.map((entry, index) => {
    const rank = index + 1;

    return `${rankLabel(rank)} **${entry.username}**
${starsEmoji(entry.stars)} **(${entry.stars}/5)**`;
  });

  const embed = new EmbedBuilder()
    .setTitle("🏆 Server Feedback Leaderboard")
    .setColor(0xf1c40f)
    .setDescription(lines.join("\n\n"))
    .setFooter({
      text: `Total Reviews • ${entries.length}`,
    })
    .setTimestamp();

  // Discord allows only 25 select menu options.
  const options = entries.slice(0, 25).map((entry, index) => {
    const rank = index + 1;

    return new StringSelectMenuOptionBuilder()
      .setLabel(entry.username.slice(0, 100))
      .setValue(entry.user_id)
      .setDescription(
        `${RANK_MEDAL[rank] ?? `#${rank}`} • ${entry.stars}/5 Stars`
      );
  });

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(SELECT_MENU_ID)
      .setPlaceholder(
        entries.length > 25
          ? "Select a user (first 25 shown)..."
          : "Select a user..."
      )
      .addOptions(options)
  );

  await interaction.editReply({
    embeds: [embed],
    components: [row],
  });
}

/*──────────────────────────────────────────────*/

async function handleLeaderboardSelect(interaction) {
  if (interaction.customId !== SELECT_MENU_ID) {
    return false;
  }

  const userId = interaction.values[0];

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const feedback = await getUserFeedback(
    interaction.guild.id,
    userId
  );

  if (!feedback) {
    await interaction.editReply({
      content:
        "⚠️ That feedback no longer exists or has been reset.",
    });

    return true;
  }

  const timestamp = Math.floor(
    new Date(feedback.created_at).getTime() / 1000
  );

  const embed = new EmbedBuilder()
    .setTitle(`📝 ${feedback.username}'s Feedback`)
    .setColor(starColor(feedback.stars))
    .setDescription(`> ${feedback.reason.replace(/\n/g, "\n> ")}`)
    .addFields(
      {
        name: "⭐ Rating",
        value: `${starsEmoji(feedback.stars)} (${feedback.stars}/5)`,
        inline: true,
      },
      {
        name: "📅 Submitted",
        value: `<t:${timestamp}:F>`,
        inline: true,
      }
    )
    .setFooter({
      text: `User ID: ${feedback.user_id}`,
    })
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
  });

  return true;
}

module.exports = {
  handleLeaderboardCommand,
  handleLeaderboardSelect,
  SELECT_MENU_ID,
};
