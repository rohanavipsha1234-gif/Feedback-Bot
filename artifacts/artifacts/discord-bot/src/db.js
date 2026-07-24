/**
 * db.js
 *
 * Lightweight PostgreSQL client for the Discord bot.
 * Uses the pg Pool directly (no Drizzle) so this plain-JS CommonJS
 * module can share the same DATABASE_URL as the rest of the workspace.
 */

const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set. Feedback will not be persisted.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/**
 * Pre-warm the connection pool so the very first DB query isn't cold.
 * Call this once on bot startup (inside the "ready" event).
 */
async function warmup() {
  try {
    await pool.query("SELECT 1");
    console.log("✅  DB connection warmed up.");
  } catch (err) {
    console.error("⚠️  DB warm-up failed:", err.message);
  }
}

/**
 * Check whether a user has already submitted feedback.
 * @param {string} userId Discord user ID
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

module.exports = {
  // ...
  hasSubmittedFeedback,
};

/**
 * Delete all feedback submissions for a user.
 * Called when the user leaves the server so they can submit again if they rejoin.
 * @param {string} userId Discord user ID
 */
async function deleteUserFeedback(userId) {
  await pool.query(
    `DELETE FROM feedback_submissions WHERE user_id = $1`,
    [userId]
  );
}

/**
 * Save a feedback submission to the database.
 * @param {string} userId      Discord user ID
 * @param {string} username    Discord username (tag)
 * @param {number} stars       Star rating (1–5)
 * @param {string} reason      Freeform reason text
 */
async function saveFeedback(userId, username, guildId, stars, reason) {
  await pool.query(
    `INSERT INTO feedback_submissions
    (user_id, username, guild_id, stars, reason)
    VALUES ($1, $2, $3, $4, $5)`,
    [userId, username, guildId, stars, reason]
  );
}

/**
 * Fetch aggregate stats across all feedback submissions.
 * @returns {{ total: number, average: number, breakdown: Record<number, number> }}
 */
async function getFeedbackStats() {
  const summaryRes = await pool.query(
    `SELECT COUNT(*)::int AS total, ROUND(AVG(stars)::numeric, 2) AS average
     FROM feedback_submissions`
  );

  const breakdownRes = await pool.query(
    `SELECT stars, COUNT(*)::int AS count
     FROM feedback_submissions
     GROUP BY stars
     ORDER BY stars`
  );

  const { total, average } = summaryRes.rows[0];

  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of breakdownRes.rows) {
    breakdown[row.stars] = row.count;
  }

  return { total, average: average ? parseFloat(average) : 0, breakdown };
}

/**
 * Fetch the top N feedback submissions sorted by stars (desc), then by
 * submission time (asc) as a tiebreaker.
 * @param {number} limit Max entries to return (default 10)
 * @returns {Promise<Array>}
 */
async function getLeaderboard(limit = 10) {
  const result = await pool.query(
    `SELECT user_id, username, stars, reason, created_at
     FROM feedback_submissions
     ORDER BY stars DESC, created_at ASC
     LIMIT $1`,
    [limit]
  );
  return result.rows;
}

/**
 * Fetch a single user's feedback submission.
 * @param {string} userId Discord user ID
 * @returns {Promise<object|null>}
 */
async function getUserFeedback(userId) {
  const result = await pool.query(
    `SELECT user_id, username, stars, reason, created_at
     FROM feedback_submissions
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] ?? null;
}

module.exports = { warmup, hasUserSubmitted, deleteUserFeedback, saveFeedback, getFeedbackStats, getLeaderboard, getUserFeedback };
