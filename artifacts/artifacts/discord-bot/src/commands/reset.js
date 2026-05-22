/**
 * commands/reset.js
 *
 * Handles the /reset slash command.
 * Admin-only: deletes a mentioned member's feedback submission from the DB
 * so they can submit a new review.
 *
 * Usage: /reset @member
 */

const { EmbedBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { deleteUserFeedback, hasUserSubmitted } = require("../db");

/**
 * Handle the /reset slash command.
 */
async function handleResetCommand(interaction) {
  // Discord enforces the admin-only restriction via default_member_permissions,
  // but we double-check here as a safety net.
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({
      content: "⛔ You need **Administrator** permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer immediately — two DB operations follow and must not hit Discord's 3s timeout
  await interaction.deferReply();

  const targetUser = interaction.options.getUser("member", true);

  // Run both DB operations concurrently — check existence then delete
  const hadSubmission = await hasUserSubmitted(targetUser.id);
  await deleteUserFeedback(targetUser.id);

  const embed = new EmbedBuilder()
    .setTitle("🔄 Feedback Reset")
    .setColor(0x5865f2)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: "👤 Member",
        value: `${targetUser.tag} (<@${targetUser.id}>)`,
        inline: true,
      },
      {
        name: "📋 Previous Submission",
        value: hadSubmission ? "✅ Found & deleted" : "❌ None on record",
        inline: true,
      }
    )
    .setDescription(
      hadSubmission
        ? `<@${targetUser.id}> can now submit a fresh feedback review.`
        : `<@${targetUser.id}> had no existing feedback — nothing to reset.`
    )
    .setFooter({ text: `Reset by ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { handleResetCommand };
