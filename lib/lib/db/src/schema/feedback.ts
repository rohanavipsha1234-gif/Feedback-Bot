import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackSubmissionsTable = pgTable("feedback_submissions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  username: text("username").notNull(),
  stars: integer("stars").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackSchema = createInsertSchema(feedbackSubmissionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertFeedback = z.infer<typeof insertFeedbackSchema>;
export type Feedback = typeof feedbackSubmissionsTable.$inferSelect;
