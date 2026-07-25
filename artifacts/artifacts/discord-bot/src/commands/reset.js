/**
 * commands/reset.js
 *
 * Handles the /reset slash command.
 *
 * Administrator only.
 * Removes a member's feedback for the current server,
 * allowing them to submit feedback again.
 */

const {
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const {
  deleteUserFeedback,
  hasSubmittedFeedback,
} = require("../db");

async function handleResetCommand(interaction) {
  // Safety check
  if (
    !interaction.memberPermissions.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return interaction.reply({
      content:
        "⛔ You need Administrator permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const targetUser = interaction.options.getUser(
    "member",
    true
  );

  const guildId = interaction.guildId;

  const hadSubmission = await hasSubmittedFeedback(
    guildId,
    targetUser.id
  );

  if (hadSubmission) {
    await deleteUserFeedback(
      guildId,
      targetUser.id
    );
  }

  const embed = new EmbedBuilder()
    .setTitle("🔄 Feedback Reset")
    .setColor(0x5865f2)
    .setThumbnail(
      targetUser.displayAvatarURL({
        dynamic: true,
      })
    )
    .addFields(
      {
        name: "👤 Member",
        value: `${targetUser.tag} (<@${targetUser.id}>)`,
        inline: true,
      },
      {
        name: "📋 Status",
        value: hadSubmission
          ? "✅ Feedback removed"
          : "❌ No feedback found",
        inline: true,
      }
    )
    .setDescription(
      hadSubmission
        ? `${targetUser} can now submit feedback again.`
        : `${targetUser} has not submitted feedback in this server.`
    )
    .setFooter({
      text: `Reset by ${interaction.user.tag}`,
    })
    .setTimestamp();

  await interaction.editReply({
    embeds: [embed],
  });
}

module.exports = {
  handleResetCommand,
};
