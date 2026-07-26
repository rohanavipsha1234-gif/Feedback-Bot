/**
 * commands/feedback.js
 *
 * Permanent Feedback System
 *
 * Features:
 * • Admins create one permanent feedback panel using /feedback.
 * • Anyone can click the panel.
 * • Each member can submit feedback only once per server.
 * • Feedback is saved to PostgreSQL.
 * • Reviews are posted to the configured feedback channel.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
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
  1: "⭐",
  2: "⭐⭐",
  3: "⭐⭐⭐",
  4: "⭐⭐⭐⭐",
  5: "⭐⭐⭐⭐⭐",
};

// ─────────────────────────────────────────────────────────────
// Embed Builders
// ─────────────────────────────────────────────────────────────

function buildFeedbackEmbed() {
  return new EmbedBuilder()
    .setTitle("🌟 Server Feedback")
    .setColor(0x5865F2)
    .setDescription(
      [
        "Your feedback helps us improve our community.",
        "",
        "Please choose a star rating below and tell us what you liked or what could be improved.",
        "",
        "**Each member can submit feedback once per server.**",
      ].join("\n")
    )
    .setFooter({
      text: "Thank you for supporting our community ❤️",
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
  }[stars] ?? 0x5865F2;
}

function buildResultEmbed(user, stars, reason) {
  return new EmbedBuilder()
    .setTitle("📋 New Feedback")
    .setColor(starColor(stars))
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      {
        name: "👤 User",
        value: `${user.tag}\n<@${user.id}>`,
        inline: true,
      },
      {
        name: "⭐ Rating",
        value: STAR_LABELS[stars],
        inline: true,
      },
      {
        name: "💬 Feedback",
        value: reason,
      }
    )
    .setFooter({
      text: `User ID: ${user.id}`,
    })
    .setTimestamp();
}

// ─────────────────────────────────────────────────────────────
// Component Builders
// ─────────────────────────────────────────────────────────────

function buildRatingRows() {
  const starRow = new ActionRowBuilder();

  for (let stars = 1; stars <= 5; stars++) {
    starRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${STAR_BUTTON_PREFIX}${stars}`)
        .setEmoji("⭐")
        .setLabel(`${stars}`)
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
    .setTitle(`${STAR_LABELS[stars]} Feedback`);

  const input = new TextInputBuilder()
    .setCustomId(REASON_INPUT_ID)
    .setLabel("Tell us about your experience")
    .setPlaceholder(
      "What did you like? What could we improve?"
    )
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1000);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return modal;
}

// ─────────────────────────────────────────────────────────────
// Interaction Handlers
// ─────────────────────────────────────────────────────────────

async function handleFeedbackCommand(interaction) {
  // Only administrators can create the feedback panel
  if (
    !interaction.memberPermissions.has(
      PermissionFlagsBits.Administrator
    )
  ) {
    return interaction.reply({
      content: "⛔ Only administrators can create the feedback panel.",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    embeds: [buildFeedbackEmbed()],
    components: buildRatingRows(),
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

  // Skip button
  if (customId === SKIP_BUTTON_ID) {
    await interaction.reply({
      content: "Feedback skipped.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // Prevent duplicate feedback
  const alreadySubmitted = await hasSubmittedFeedback(
    interaction.guild.id,
    interaction.user.id
  );

  if (alreadySubmitted) {
    await interaction.reply({
      content:
        "⚠️ You have already submitted feedback for this server.",
      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  // Open modal
  const stars = Number(
    customId.replace(STAR_BUTTON_PREFIX, "")
  );

  await interaction.showModal(
    buildFeedbackModal(
      stars,
      interaction.message.id
    )
  );

  return true;
}

async function handleModalSubmit(
  interaction,
  feedbackChannelId
) {
  const { customId } = interaction;

  if (!customId.startsWith(MODAL_PREFIX)) {
    return false;
  }

  const payload = customId.substring(
    MODAL_PREFIX.length
  );

  const splitIndex = payload.indexOf("_");

  const stars = Number(
    payload.substring(0, splitIndex)
  );

  const reason = interaction.fields.getTextInputValue(
    REASON_INPUT_ID
  );

  const user = interaction.user;

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  try {
    // Double-check duplicate submission
    const alreadySubmitted =
      await hasSubmittedFeedback(
        interaction.guild.id,
        user.id
      );

    if (alreadySubmitted) {
      return interaction.editReply({
        content:
          "⚠️ You have already submitted feedback for this server.",
      });
    }

    const feedbackChannel =
      await interaction.client.channels.fetch(
        feedbackChannelId
      );

    if (
      !feedbackChannel ||
      !feedbackChannel.isTextBased()
    ) {
      throw new Error(
        "Feedback channel not found."
      );
    }

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
      content: `✅ Thank you! Your ${STAR_LABELS[stars]} feedback has been recorded successfully.`,
    });
  } catch (err) {
    console.error(
      "[feedback] Failed to save feedback:",
      err
    );

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
