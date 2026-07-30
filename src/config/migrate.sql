-- Add rejection_reason to claims if it doesn't exist
ALTER TABLE claims ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Create chats table if it doesn't exist
CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES items(id) ON DELETE CASCADE,
  finder_id UUID REFERENCES users(id) ON DELETE CASCADE,
  claimer_id UUID REFERENCES users(id) ON DELETE CASCADE,
  last_message_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_id, finder_id, claimer_id)
);

-- Create messages table if it doesn't exist
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID REFERENCES chats(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  read_status BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add post_type to items (lost vs found), separate from status lifecycle
ALTER TABLE items ADD COLUMN IF NOT EXISTS post_type VARCHAR(10) NOT NULL DEFAULT 'found';
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_post_type_check;
ALTER TABLE items ADD CONSTRAINT items_post_type_check CHECK (post_type IN ('lost', 'found'));

-- Referral tracking: tag which QR code / flier / link a user came from
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_source TEXT;

-- Student verification: mark accounts with a .edu email domain
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_domain TEXT;

-- Human-readable school name derived from the verified .edu domain
ALTER TABLE users ADD COLUMN IF NOT EXISTS school_name TEXT;
-- Update #4: campus scoping
ALTER TABLE users ADD COLUMN IF NOT EXISTS home_campus TEXT;
ALTER TABLE items ADD COLUMN IF NOT EXISTS campus TEXT;
-- Update #5: resolution tracking + ratings/testimonials
ALTER TABLE items ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID REFERENCES claims(id) ON DELETE CASCADE,
  rater_id UUID REFERENCES users(id) ON DELETE CASCADE,
  ratee_id UUID REFERENCES users(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  testimonial TEXT,
  testimonial_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(claim_id, rater_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_id);
