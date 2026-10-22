// Ratings (Jared) - FR-16
//
//   GET /api/ratings/:userId
//
// Someone's average star rating and the reviews other people left them.
// Used for the rating on match cards and the profile screen.
// (Leaving a review is Himal's POST /api/reviews.)

import { Router } from 'express';
import { db } from '../db.js';
import { auth } from '../middleware/auth.js';
import { asyncRoute } from '../lib/errors.js';

const router = Router();
router.use(auth); // must be logged in

router.get('/:userId', asyncRoute(async (req, res) => {
  const userId = req.params.userId;

  // User ids are UUIDs. Check the format first so a bad id gets a
  // clear 400 instead of a database error.
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidPattern.test(userId)) {
    return res.status(400).json({ error: 'Invalid user id', code: 'VALIDATION_ERROR' });
  }

  const userResult = await db('SELECT id, full_name FROM users WHERE id = $1', [userId]);
  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: 'User not found', code: 'NOT_FOUND' });
  }
  const user = userResult.rows[0];

  // Average and count. AVG gives null when there are no reviews yet.
  const summary = await db(
    `SELECT ROUND(AVG(rating), 1) AS average, COUNT(*) AS count
     FROM reviews WHERE reviewed_id = $1`,
    [userId]
  );

  const reviewList = await db(
    `SELECT rv.rating, rv.comment, rv.created_at AS "createdAt",
            reviewer.full_name AS "reviewerName"
     FROM reviews rv
     JOIN users reviewer ON reviewer.id = rv.reviewer_id
     WHERE rv.reviewed_id = $1
     ORDER BY rv.created_at DESC
     LIMIT 50`,
    [userId]
  );

  // Postgres sends AVG and COUNT back as text, so turn them into numbers
  let average = null;
  if (summary.rows[0].average !== null) {
    average = Number(summary.rows[0].average);
  }

  res.json({
    userId: user.id,
    fullName: user.full_name,
    averageRating: average,
    reviewCount: Number(summary.rows[0].count),
    reviews: reviewList.rows,
  });
}));

export default router;
