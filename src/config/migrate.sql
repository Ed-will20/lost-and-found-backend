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
