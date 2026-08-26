ALTER TABLE users ADD COLUMN event_credits INT UNSIGNED NOT NULL DEFAULT 0 AFTER subscription_ends_at;

-- Preserve one unused event pass for currently active users who have not created an event.
UPDATE users u
SET u.event_credits = 1
WHERE u.subscription_status = 'active'
  AND NOT EXISTS (SELECT 1 FROM events e WHERE e.user_id = u.id);
