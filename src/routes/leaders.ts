import { Hono } from 'hono';
import type { Env } from '../types';

export const leadersApi = new Hono<{ Bindings: Env }>();

type ReviewerRow = {
  reviewer_name: string;
  reviewer_type: string;
  reviewer_pubkey: string | null;
  review_count: number;
  avg_rating: number | null;
};

type ItemLead = {
  slug: string;
  name: string;
  category: string;
  review_count: number;
  avg_rating: number | null;
};

leadersApi.get('/.json', async c => {
  const [reviewers, items] = await Promise.all([
    c.env.DB
      .prepare(
        `SELECT reviewer_name, reviewer_type, reviewer_pubkey,
                COUNT(*) AS review_count, AVG(rating) AS avg_rating
         FROM reviews WHERE hidden = 0
         GROUP BY COALESCE(reviewer_pubkey, reviewer_name)
         ORDER BY review_count DESC LIMIT 25`,
      )
      .all<ReviewerRow>(),
    c.env.DB
      .prepare(
        `SELECT slug, name, category, review_count, avg_rating
         FROM items WHERE review_count > 0
         ORDER BY review_count DESC, avg_rating DESC LIMIT 25`,
      )
      .all<ItemLead>(),
  ]);
  return c.json({ reviewers: reviewers.results || [], items: items.results || [] });
});
