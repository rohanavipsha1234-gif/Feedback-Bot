/**
 * db.js
 *
 * PostgreSQL database helper for the Discord Feedback Bot.
 * Uses pg Pool directly (CommonJS).
 */

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Feedback will not be persisted.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Warm up the database connection.
 */
async function warmup() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Database connection established.");
  } catch (err) {
    console.error("⚠️ Failed to connect to PostgreSQL:", err.message);
  }
}

/**
 * Check whether a user has already submitted feedback
 * in a specific server.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasSubmittedFeedback(guildId, userId) {
  const result = await pool.query(
    `
    SELECT 1
    FROM feedback_submissions
    WHERE guild_id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [guildId, userId]
  );

  return result.rowCount > 0;
}

/**
 * Delete a user's feedback
 * from a specific server.
 *
 * @param {string} guildId
 * @param {string} userId
 */
async function deleteUserFeedback(guildId, userId) {
  await pool.query(
    `
    DELETE FROM feedback_submissions
    WHERE guild_id = $1
      AND user_id = $2
    `,
    [guildId, userId]
  );
}

/**
 * Save feedback.
 *
 * Duplicate feedback is prevented by
 * UNIQUE(user_id, guild_id).
 *
 * @param {string} userId
 * @param {string} username
 * @param {string} guildId
 * @param {number} stars
 * @param {string} reason
 */
async function saveFeedback(userId, username, guildId, stars, reason) {
  await pool.query(
    `
    INSERT INTO feedback_submissions
      (user_id, username, guild_id, stars, reason)
    VALUES
      ($1, $2, $3, $4, $5)
    ON CONFLICT (user_id, guild_id)
    DO NOTHING
    `,
    [userId, username, guildId, stars, reason]
  );
}

/**
 * Get feedback statistics.
 *
 * If guildId is supplied,
 * returns statistics for that server only.
 *
 * @param {string|null} guildId
 */
async function getFeedbackStats(guildId = null) {
  const params = [];
  let where = "";

  if (guildId) {
    where = "WHERE guild_id = $1";
    params.push(guildId);
  }

  const summaryRes = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      ROUND(AVG(stars)::numeric, 2) AS average
    FROM feedback_submissions
    ${where}
    `,
    params
  );

  const breakdownRes = await pool.query(
    `
    SELECT
      stars,
      COUNT(*)::int AS count
    FROM feedback_submissions
    ${where}
    GROUP BY stars
    ORDER BY stars
    `,
    params
  );

  const breakdown = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };

  for (const row of breakdownRes.rows) {
    breakdown[row.stars] = row.count;
  }

  return {
    total: summaryRes.rows[0].total,
    average: summaryRes.rows[0].average
      ? Number(summaryRes.rows[0].average)
      : 0,
    breakdown,
  };
}

/**
 * Get leaderboard.
 *
 * If limit is null,
 * returns every submission.
 *
 * @param {string} guildId
 * @param {number|null} limit
 */
async function getLeaderboard(guildId, limit = null) {
  const baseQuery = `
    SELECT
      user_id,
      username,
      stars,
      reason,
      created_at
    FROM feedback_submissions
    WHERE guild_id = $1
    ORDER BY
      stars DESC,
      created_at ASC
  `;

  if (limit == null) {
    const result = await pool.query(baseQuery, [guildId]);
    return result.rows;
  }

  const result = await pool.query(
    `${baseQuery}
     LIMIT $2`,
    [guildId, limit]
  );

  return result.rows;
}

/**
 * Get one user's feedback
 * for a specific server.
 *
 * @param {string} guildId
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getUserFeedback(guildId, userId) {
  const result = await pool.query(
    `
    SELECT
      user_id,
      username,
      stars,
      reason,
      created_at
    FROM feedback_submissions
    WHERE guild_id = $1
      AND user_id = $2
    LIMIT 1
    `,
    [guildId, userId]
  );

  return result.rows[0] ?? null;
}

module.exports = {
  warmup,
  hasSubmittedFeedback,
  deleteUserFeedback,
  saveFeedback,
  getFeedbackStats,
  getLeaderboard,
  getUserFeedback,
};
