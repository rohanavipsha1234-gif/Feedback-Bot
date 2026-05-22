/**
 * commands/feedback.js
 *
 * Handles the /feedback slash command and all related interactions:
 *   - Initial embed + rating buttons (only the invoker can interact)
 *   - Star rating → modal popup
 *   - Modal submission → saves to DB, posts embed to feedback channel, deletes the prompt
 *   - Skip button → deletes the prompt, sends ephemeral confirmation
 *
 * Behaviour rules:
 *   1. Only the user who ran /feedback can click the buttons.
 *   2. Each user can only submit feedback once (checked against the DB).
 *   3. After submission or skip, the embed + buttons are automatically deleted.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require("discord.js");

const { hasUserSubmitted, saveFeedback } = require("../db");

// ─── Custom ID constants ───────────────────────────────────────────────────────
const STAR_BUTTON_PREFIX = "star_rating_";    // e.g. "star_rating_3"
const SKIP_BUTTON_ID     = "skip_feedback";
// Modal custom ID format: "feedback_modal_<stars>_<messageId>"
// Encoding the message ID lets us delete the original embed after submission.
const MODAL_PREFIX       = "feedback_modal_"; // e.g. "feedback_modal_3_1234567890"
const REASON_INPUT_ID    = "leave_reason";

// ─── Star label map ────────────────────────────────────────────────────────────
const STAR_LABELS = { 1: "1⭐", 2: "2⭐", 3: "3⭐", 4: "4⭐", 5: "5⭐" };

// ─── Active sessions ───────────────────────────────────────────────────────────
// Maps messageId → { userId, channelId } so we can:
//   a) Reject button clicks from users who didn't invoke /feedback on that message
//   b) Delete the message after the modal is submitted
const sessions = new Map();

// ─── Embed builders ────────────────────────────────────────────────────────────

function buildFeedbackEmbed() {
  return new EmbedBuilder()
    .setTitle("Before You Leave...")
    .setDescription(
      "Please rate the server and tell us what could improve.\n\n" +
        "Select a star rating below, or click **Skip** to leave without feedback."
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Your feedback helps us make this server better." })
    .setTimestamp();
}

function buildResultEmbed(user, stars, reason) {
  return new EmbedBuilder()
    .setTitle("📋 New Server Feedback")
    .setColor(starColor(stars))
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      { name: "👤 User",   value: `${user.tag} (<@${user.id}>)`, inline: true },
      { name: "⭐ Rating", value: STAR_LABELS[stars],            inline: true },
      { name: "💬 Reason", value: reason }
    )
    .setFooter({ text: `User ID: ${user.id}` })
    .setTimestamp();
}

function starColor(stars) {
  return { 1: 0xed4245, 2: 0xe67e22, 3: 0xfee75c, 4: 0x57f287, 5: 0x1abc9c }[stars] ?? 0x5865f2;
}

function buildCompletionEmbed(user) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({
      name: "Feedback Submitted",
      iconURL: user.displayAvatarURL({ dynamic: true }),
    })
    .setDescription(
      `🌟 **${user.username}** has submitted their feedback successfully.\nThank you for supporting and helping improve the server!`
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setFooter({ text: "We appreciate every voice in our community ✨" })
    .setTimestamp();
}

// ─── Component builders ────────────────────────────────────────────────────────

function buildRatingRows() {
  const starRow = new ActionRowBuilder();

  for (let stars = 1; stars <= 5; stars++) {
    starRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${STAR_BUTTON_PREFIX}${stars}`)
        .setLabel(STAR_LABELS[stars])
        .setStyle(ButtonStyle.Primary)
    );
  }

  const skipRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(SKIP_BUTTON_ID)
      .setLabel("Skip")
      .setStyle(ButtonStyle.Danger)
  );

  return [starRow, skipRow];
}

/**
 * Build a modal for the given star rating, encoding the source message ID
 * so we can find and delete it after the user submits.
 */
function buildFeedbackModal(stars, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${stars}_${messageId}`)
    .setTitle(`${STAR_LABELS[stars]} — Share Your Feedback`);

  const reasonInput = new TextInputBuilder()
    .setCustomId(REASON_INPUT_ID)
    .setLabel("Why are you leaving the server?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Tell us what could be improved, what you didn't enjoy, or anything else…")
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
  return modal;
}

// ─── Helper: delete the original feedback prompt ───────────────────────────────
async function deletePromptMessage(client, messageId) {
  const session = sessions.get(messageId);
  if (!session) return;

  sessions.delete(messageId);

  try {
    const channel = await client.channels.fetch(session.channelId);
    const message = await channel.messages.fetch(messageId);
    await message.delete();
  } catch {
    // The message may have already been deleted — ignore silently
  }
}

// ─── Exported interaction handlers ────────────────────────────────────────────

/**
 * Handle the /feedback slash command.
 * Blocks repeat submissions, then sends the embed + buttons.
 */
async function handleFeedbackCommand(interaction) {
  // ── One-time review gate ───────────────────────────────────────────────────
  const alreadySubmitted = await hasUserSubmitted(interaction.user.id);

  if (alreadySubmitted) {
    await interaction.reply({
      content: "✅ You've already submitted your feedback. Thank you!",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // ── Send the feedback prompt and register the session ─────────────────────
  const embed = buildFeedbackEmbed();
  const rows  = buildRatingRows();

  // fetchReply: true returns the actual Message so we can record its ID
  const reply = await interaction.reply({
    embeds:     [embed],
    components: rows,
    fetchReply: true,
  });

  // Store who owns this message so button clicks can be validated
  sessions.set(reply.id, {
    userId:    interaction.user.id,
    channelId: reply.channelId,
  });
}

/**
 * Handle button interactions (star ratings and skip).
 * Enforces ownership — only the original invoker can click.
 * Returns true if the interaction was ours, false otherwise.
 */
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;

  // Only handle buttons we own
  const isOurButton =
    customId.startsWith(STAR_BUTTON_PREFIX) || customId === SKIP_BUTTON_ID;
  if (!isOurButton) return false;

  const messageId = interaction.message.id;
  const session   = sessions.get(messageId);

  // ── Ownership check ────────────────────────────────────────────────────────
  // Reject clicks from anyone other than the user who ran /feedback
  if (!session || session.userId !== interaction.user.id) {
    await interaction.reply({
      content: "⚠️ This feedback prompt isn't yours to interact with.",
      flags:   MessageFlags.Ephemeral,
    });
    return true;
  }

  // ── Star rating button → open modal ───────────────────────────────────────
  if (customId.startsWith(STAR_BUTTON_PREFIX)) {
    const stars = parseInt(customId.replace(STAR_BUTTON_PREFIX, ""), 10);
    // Encode the message ID in the modal custom ID so we can delete it later
    const modal = buildFeedbackModal(stars, messageId);
    await interaction.showModal(modal);
    return true;
  }

  // ── Skip button → delete prompt, confirm ephemerally ──────────────────────
  if (customId === SKIP_BUTTON_ID) {
    // Acknowledge the button interaction silently, then delete the message
    await interaction.deferUpdate();
    await deletePromptMessage(interaction.client, messageId);
    await interaction.followUp({
      content: "Feedback skipped. You may leave anytime.",
      flags:   MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}

/**
 * Handle modal submissions.
 * Saves feedback to the DB, posts the result embed to the feedback channel,
 * and deletes the original prompt message.
 * Returns true if handled, false otherwise.
 */
async function handleModalSubmit(interaction, feedbackChannelId) {
  const { customId } = interaction;

  if (!customId.startsWith(MODAL_PREFIX)) return false;

  // Parse "feedback_modal_<stars>_<messageId>" from the custom ID
  const withoutPrefix = customId.slice(MODAL_PREFIX.length); // e.g. "3_1234567890"
  const splitAt       = withoutPrefix.indexOf("_");
  const stars         = parseInt(withoutPrefix.slice(0, splitAt), 10);
  const messageId     = withoutPrefix.slice(splitAt + 1);

  const reason = interaction.fields.getTextInputValue(REASON_INPUT_ID);
  const user   = interaction.user;

  // Acknowledge the modal immediately so Discord doesn't time out
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  // Capture the original channel before deletePromptMessage clears the session
  const session = sessions.get(messageId);
  const originChannelId = session?.channelId ?? null;

  try {
    const feedbackChannel = await interaction.client.channels.fetch(feedbackChannelId);

    if (!feedbackChannel || !feedbackChannel.isTextBased()) {
      throw new Error("Feedback channel not found or is not a text channel.");
    }

    const resultEmbed = buildResultEmbed(user, stars, reason);

    // Save to DB, post feedback embed, and delete the prompt — all in parallel
    await Promise.all([
  saveFeedback(
    user.id,
    user.tag,
    interaction.guild.id,
    stars,
    reason
  ),
  feedbackChannel.send({ embeds: [resultEmbed] }),
  deletePromptMessage(interaction.client, messageId),
]);

    // Send a public completion notice back to the channel where /feedback was used
    if (originChannelId) {
      try {
        const originChannel = await interaction.client.channels.fetch(originChannelId);
        if (originChannel?.isTextBased()) {
          await originChannel.send({ embeds: [buildCompletionEmbed(user)] });
        }
      } catch {
        // Non-fatal — best-effort notification
      }
    }

    await interaction.editReply({
      content: `✅ Thank you for your feedback! Your **${STAR_LABELS[stars]}** rating has been recorded.`,
    });
  } catch (err) {
    console.error("[feedback] Failed to process modal submission:", err);
    await interaction.editReply({
      content: "⚠️ Something went wrong saving your feedback. Please try again later.",
    });
  }

  return true;
}

module.exports = {
  handleFeedbackCommand,
  handleButtonInteraction,
  handleModalSubmit,
};
