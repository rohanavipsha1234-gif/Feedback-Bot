/**
 * db.js
 *
 * Lightweight PostgreSQL client for the Discord bot.
 * Uses the pg Pool directly (no Drizzle) so this plain-JS CommonJS
 * module can share the same DATABASE_URL as the rest of the workspace.
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
 * Pre-warm the database connection.
 */
async function warmup() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ DB connection warmed up.");
  } catch (err) {
    console.error("⚠️ DB warm-up failed:", err.message);
  }
}

/**
 * Check whether a user has already submitted feedback in this server.
 *
 * @param {string} guildId Discord Guild ID
 * @param {string} userId Discord User ID
 * @returns {Promise<boolean>}
 */
async function hasSubmittedFeedback(guildId, userId) {
  const result = await pool.query(
    `SELECT 1
     FROM feedback_submissions
     WHERE guild_id = $1
       AND user_id = $2
     LIMIT 1`,
    [guildId, userId]
  );

  return result.rowCount > 0;
}

/**
 * Delete a user's feedback for a specific server.
 *
 * @param {string} guildId Discord Guild ID
 * @param {string} userId Discord User ID
 */
async function deleteUserFeedback(guildId, userId) {
  await pool.query(
    `DELETE FROM feedback_submissions
     WHERE guild_id = $1
       AND user_id = $2`,
    [guildId, userId]
  );
}

/**
 * Save a feedback submission.
 *
 * Duplicate submissions from the same user in the same server
 * are ignored because of the UNIQUE(user_id, guild_id) constraint.
 *
 * @param {string} userId
 * @param {string} username
 * @param {string} guildId
 * @param {number} stars
 * @param {string} reason
 */
async function saveFeedback(userId, username, guildId, stars, reason) {
  await pool.query(
    `INSERT INTO feedback_submissions
      (user_id, username, guild_id, stars, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, guild_id) DO NOTHING`,
    [userId, username, guildId, stars, reason]
  );
}

/**
 * Get overall feedback statistics.
 */
async function getFeedbackStats() {
  const summaryRes = await pool.query(
    `SELECT
        COUNT(*)::int AS total,
        ROUND(AVG(stars)::numeric, 2) AS average
     FROM feedback_submissions`
  );

  const breakdownRes = await pool.query(
    `SELECT
        stars,
        COUNT(*)::int AS count
     FROM feedback_submissions
     GROUP BY stars
     ORDER BY stars`
  );

  const { total, average } = summaryRes.rows[0];

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
    total,
    average: average ? Number(average) : 0,
    breakdown,
  };
}

/**
 * Get leaderboard.
 */
async function getLeaderboard(limit = 10) {
  const result = await pool.query(
    `SELECT
        user_id,
        username,
        stars,
        reason,
        created_at
     FROM feedback_submissions
     ORDER BY stars DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

/**
 * Get one user's feedback.
 *
 * @param {string} userId
 * @returns {Promise<object|null>}
 */
async function getUserFeedback(userId) {
  const result = await pool.query(
    `SELECT
        user_id,
        username,
        stars,
        reason,
        created_at
     FROM feedback_submissions
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
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
