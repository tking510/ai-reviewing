-- Add consumer-oriented optional fields to items.
-- Location, price tier, and context tags. All nullable; backward-compatible.

ALTER TABLE items ADD COLUMN location TEXT;        -- freeform text (e.g. "東京都渋谷区")
ALTER TABLE items ADD COLUMN lat REAL;             -- optional lat for map/distance
ALTER TABLE items ADD COLUMN lng REAL;             -- optional lng
ALTER TABLE items ADD COLUMN price_tier TEXT;      -- "¥" | "¥¥" | "¥¥¥" | "¥¥¥¥" | "¥¥¥¥¥"
ALTER TABLE items ADD COLUMN use_case_tags TEXT NOT NULL DEFAULT '[]';  -- JSON array
ALTER TABLE items ADD COLUMN subcategory TEXT;     -- freeform (e.g. "ramen" under "restaurant")

CREATE INDEX idx_items_location ON items(location) WHERE location IS NOT NULL;
CREATE INDEX idx_items_price_tier ON items(price_tier) WHERE price_tier IS NOT NULL;
CREATE INDEX idx_items_subcategory ON items(subcategory) WHERE subcategory IS NOT NULL;
