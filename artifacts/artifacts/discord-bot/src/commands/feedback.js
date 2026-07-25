/**
 * commands/feedback.js
 *
 * Handles the /feedback slash command and its helper functions.
 *
 * Features:
 * • Anyone can click the feedback panel.
 * • Each user may submit feedback only once per server.
 * • Selecting a star opens a feedback modal.
 * • Feedback is stored in PostgreSQL.
 * • The feedback panel is deleted after submission or skip.
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

const {
  hasSubmittedFeedback,
  saveFeedback,
} = require("../db");

// ─────────────────────────────────────────────────────────────
// Custom IDs
// ─────────────────────────────────────────────────────────────

const STAR_BUTTON_PREFIX = "star_rating_";
const SKIP_BUTTON_ID = "skip_feedback";
const MODAL_PREFIX = "feedback_modal_";
const REASON_INPUT_ID = "leave_reason";

// ─────────────────────────────────────────────────────────────
// Star Labels
// ─────────────────────────────────────────────────────────────

const STAR_LABELS = {
  1: "1⭐",
  2: "2⭐",
  3: "3⭐",
  4: "4⭐",
  5: "5⭐",
};

// ─────────────────────────────────────────────────────────────
// Active feedback panels
// Stores:
// messageId -> { channelId }
// Used only so the original panel can be deleted later.
// ─────────────────────────────────────────────────────────────

const sessions = new Map();

// ─────────────────────────────────────────────────────────────
// Embed Builders
// ─────────────────────────────────────────────────────────────

function buildFeedbackEmbed() {
  return new EmbedBuilder()
    .setTitle("Before You Leave...")
    .setDescription(
      "Please rate the server and tell us what could be improved.\n\n" +
      "Click a star rating below or press **Skip**."
    )
    .setColor(0x5865f2)
    .setFooter({
      text: "Your feedback helps us improve the community.",
    })
    .setTimestamp();
}

function buildResultEmbed(user, stars, reason) {
  return new EmbedBuilder()
    .setTitle("📋 New Server Feedback")
    .setColor(starColor(stars))
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .addFields(
      {
        name: "👤 User",
        value: `${user.tag} (<@${user.id}>)`,
        inline: true,
      },
      {
        name: "⭐ Rating",
        value: STAR_LABELS[stars],
        inline: true,
      },
      {
        name: "💬 Reason",
        value: reason,
      }
    )
    .setFooter({
      text: `User ID: ${user.id}`,
    })
    .setTimestamp();
}

function buildCompletionEmbed(user) {
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({
      name: "Feedback Submitted",
      iconURL: user.displayAvatarURL({ dynamic: true }),
    })
    .setDescription(
      `🌟 **${user.username}** has successfully submitted feedback.\n\nThank you for helping improve our community!`
    )
    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
    .setFooter({
      text: "We appreciate every member ❤️",
    })
    .setTimestamp();
}

function starColor(stars) {
  return {
    1: 0xed4245,
    2: 0xe67e22,
    3: 0xfee75c,
    4: 0x57f287,
    5: 0x1abc9c,
  }[stars] ?? 0x5865f2;
}

// ─────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────

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

function buildFeedbackModal(stars, messageId) {
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${stars}_${messageId}`)
    .setTitle(`${STAR_LABELS[stars]} — Share Your Feedback`);

  const reasonInput = new TextInputBuilder()
    .setCustomId(REASON_INPUT_ID)
    .setLabel("Why are you leaving the server?")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder(
      "Tell us what could be improved..."
    )
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(reasonInput)
  );

  return modal;
}

// ─────────────────────────────────────────────────────────────
// Delete Feedback Panel
// ─────────────────────────────────────────────────────────────

async function deletePromptMessage(client, messageId) {
  const session = sessions.get(messageId);

  if (!session) return;

  sessions.delete(messageId);

  try {
    const channel = await client.channels.fetch(session.channelId);

    if (!channel?.isTextBased()) return;

    const message = await channel.messages.fetch(messageId);

    await message.delete();
  } catch {
    // Ignore if message already deleted.
  }
}

// ─────────────────────────────────────────────────────────────
// Interaction Handlers
// ─────────────────────────────────────────────────────────────

async function handleFeedbackCommand(interaction) {
  const alreadySubmitted = await hasSubmittedFeedback(
    interaction.guild.id,
    interaction.user.id
  );

  if (alreadySubmitted) {
    return interaction.reply({
      content: "✅ You have already submitted feedback for this server.",
      flags: MessageFlags.Ephemeral,
    });
  }

  const reply = await interaction.reply({
    embeds: [buildFeedbackEmbed()],
    components: buildRatingRows(),
    fetchReply: true,
  });

  sessions.set(reply.id, {
    channelId: reply.channelId,
  });
}

async function handleButtonInteraction(interaction) {
  const { customId } = interaction;

  if (
    !customId.startsWith(STAR_BUTTON_PREFIX) &&
    customId !== SKIP_BUTTON_ID
  ) {
    return false;
  }

  const messageId = interaction.message.id;
  const session = sessions.get(messageId);

  if (!session) {
    await interaction.reply({
      content: "⚠️ This feedback panel is no longer active.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  const alreadySubmitted = await hasSubmittedFeedback(
    interaction.guild.id,
    interaction.user.id
  );

  if (alreadySubmitted) {
    await interaction.reply({
      content: "⚠️ You have already submitted feedback for this server.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  if (customId.startsWith(STAR_BUTTON_PREFIX)) {
    const stars = Number(
      customId.replace(STAR_BUTTON_PREFIX, "")
    );

    await interaction.showModal(
      buildFeedbackModal(stars, messageId)
    );

    return true;
  }

  if (customId === SKIP_BUTTON_ID) {
    await interaction.deferUpdate();

    await deletePromptMessage(
      interaction.client,
      messageId
    );

    await interaction.followUp({
      content: "Feedback skipped.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  return false;
async function handleModalSubmit(interaction, feedbackChannelId) {
  const { customId } = interaction;

  if (!customId.startsWith(MODAL_PREFIX)) {
    return false;
  }

  // Parse modal custom ID
  const payload = customId.substring(MODAL_PREFIX.length);
  const splitIndex = payload.indexOf("_");

  const stars = Number(payload.substring(0, splitIndex));

  const reason = interaction.fields.getTextInputValue(REASON_INPUT_ID);
  const user = interaction.user;

  // Acknowledge interaction immediately
  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  try {
    // Prevent duplicate submissions
    const alreadySubmitted = await hasSubmittedFeedback(
      interaction.guild.id,
      user.id
    );

    if (alreadySubmitted) {
      return interaction.editReply({
        content:
          "⚠️ You have already submitted feedback for this server.",
      });
    }

    // Fetch feedback channel
    const feedbackChannel = await interaction.client.channels.fetch(
      feedbackChannelId
    );

    if (!feedbackChannel?.isTextBased()) {
      throw new Error("Feedback channel not found or is not text-based.");
    }

    // Save feedback and send embed
    await Promise.all([
      saveFeedback(
        user.id,
        user.tag,
        interaction.guild.id,
        stars,
        reason
      ),

      feedbackChannel.send({
        embeds: [
          buildResultEmbed(
            user,
            stars,
            reason
          ),
        ],
      }),
    ]);

    await interaction.editReply({
      content: `✅ Thank you! Your ${STAR_LABELS[stars]} feedback has been recorded.`,
    });

  } catch (err) {
    console.error("[feedback] Failed to process feedback:", err);

    await interaction.editReply({
      content:
        "⚠️ Something went wrong while saving your feedback. Please try again later.",
    });
  }

  return true;
}

module.exports = {
  handleFeedbackCommand,
  handleButtonInteraction,
  handleModalSubmit,
};
