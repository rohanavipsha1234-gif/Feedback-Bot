/**
 * commands/stats.js
 *
 * Handles the /feedback-stats slash command.
 * Queries the database and displays an aggregate summary embed showing:
 *   - Total submissions
 *   - Average star rating
 *   - Per-star breakdown with a visual bar
 */

const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { getFeedbackStats } = require("../db");

// ─── Visual bar builder ────────────────────────────────────────────────────────
const BAR_FILLED = "█";
const BAR_EMPTY  = "░";
const BAR_WIDTH  = 10;

function buildBar(count, total) {
  if (total === 0) return BAR_EMPTY.repeat(BAR_WIDTH);
  const filled = Math.round((count / total) * BAR_WIDTH);
  return BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(BAR_WIDTH - filled);
}

// ─── Star label map ────────────────────────────────────────────────────────────
const STAR_LABELS = { 1: "1⭐", 2: "2⭐", 3: "3⭐", 4: "4⭐", 5: "5⭐" };

// ─── Colour based on average rating ───────────────────────────────────────────
function averageColor(avg) {
  if (avg >= 4.5) return 0x1abc9c; // teal  — excellent
  if (avg >= 3.5) return 0x57f287; // green — good
  if (avg >= 2.5) return 0xfee75c; // yellow — ok
  if (avg >= 1.5) return 0xe67e22; // orange — poor
  return 0xed4245;                  // red   — bad
}

// ─── Handler ───────────────────────────────────────────────────────────────────

/**
 * Handle the /feedback-stats slash command.
 */
async function handleStatsCommand(interaction) {
  // Safety-net permission check (Discord also enforces this via default_member_permissions)
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "⛔ You need **Administrator** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer so we have time to query the DB
  await interaction.deferReply();

  const { total, average, breakdown } = await getFeedbackStats();

  if (total === 0) {
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setTitle("📊 Feedback Stats")
          .setDescription("No feedback submissions yet. Use `/feedback` to be the first!")
          .setColor(0x5865f2)
          .setTimestamp(),
      ],
    });
    return;
  }

  // Build breakdown lines: "5⭐  █████████░  42 (84%)"
  const breakdownLines = [5, 4, 3, 2, 1].map((stars) => {
    const count   = breakdown[stars];
    const percent = total > 0 ? Math.round((count / total) * 100) : 0;
    const bar     = buildBar(count, total);
    return `${STAR_LABELS[stars]}  \`${bar}\`  **${count}** (${percent}%)`;
  });

  const embed = new EmbedBuilder()
    .setTitle("📊 Server Feedback Stats")
    .setColor(averageColor(average))
    .addFields(
      {
        name: "⭐ Average Rating",
        value: `**${average.toFixed(2)} / 5.00**`,
        inline: true,
      },
      {
        name: "📬 Total Submissions",
        value: `**${total}**`,
        inline: true,
      },
      {
        name: "📈 Breakdown",
        value: breakdownLines.join("\n"),
      }
    )
    .setFooter({ text: "Based on all feedback submissions received so far." })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleStatsCommand };
