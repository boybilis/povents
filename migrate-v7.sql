CREATE TABLE pricing_plans (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NULL,
  price_centavos INT UNSIGNED NOT NULL,
  passes_per_purchase SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  max_guest_scans INT UNSIGNED NOT NULL DEFAULT 50 COMMENT '0 means unlimited',
  max_photos_per_session SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  photo_retention_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  reels_per_event SMALLINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '0 means unlimited',
  photo_albums_per_event SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  reel_duration_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  reel_image_count SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_featured TINYINT(1) NOT NULL DEFAULT 0,
  display_order SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO pricing_plans(name,slug,description,price_centavos,passes_per_purchase,max_guest_scans,max_photos_per_session,photo_retention_days,reels_per_event,photo_albums_per_event,reel_duration_seconds,reel_image_count,is_active,is_featured,display_order)
VALUES
('POVents 299','povents-299','One event for up to 50 guest scan sessions, with three reels and one saved photo album.',29900,1,50,5,7,3,1,30,20,1,1,10),
('POVents 899 Unlimited','povents-899-unlimited','One event with unlimited guest scan sessions, unlimited reels, and one saved photo album.',89900,1,0,5,7,0,1,30,20,1,0,20);

CREATE TABLE user_plan_credits (
  user_id INT UNSIGNED NOT NULL,
  pricing_plan_id INT UNSIGNED NOT NULL,
  credits INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,pricing_plan_id),
  CONSTRAINT fk_plan_credits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_credits_plan FOREIGN KEY (pricing_plan_id) REFERENCES pricing_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE payments ADD COLUMN pricing_plan_id INT UNSIGNED NULL AFTER user_id,
  ADD CONSTRAINT fk_payments_plan FOREIGN KEY (pricing_plan_id) REFERENCES pricing_plans(id) ON DELETE SET NULL;

ALTER TABLE events
  ADD COLUMN pricing_plan_id INT UNSIGNED NULL AFTER reels_created,
  ADD COLUMN plan_name VARCHAR(100) NOT NULL DEFAULT 'POVents Event Pass' AFTER pricing_plan_id,
  ADD COLUMN max_guest_scans INT UNSIGNED NOT NULL DEFAULT 50 COMMENT '0 means unlimited' AFTER plan_name,
  ADD COLUMN max_photos_per_session SMALLINT UNSIGNED NOT NULL DEFAULT 5 AFTER max_guest_scans,
  ADD COLUMN photo_retention_days SMALLINT UNSIGNED NOT NULL DEFAULT 7 AFTER max_photos_per_session,
  ADD COLUMN reels_allowed SMALLINT UNSIGNED NOT NULL DEFAULT 3 AFTER photo_retention_days,
  ADD COLUMN photo_albums_allowed SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER reels_allowed,
  ADD COLUMN reel_duration_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 30 AFTER photo_albums_allowed,
  ADD COLUMN reel_image_count SMALLINT UNSIGNED NOT NULL DEFAULT 20 AFTER reel_duration_seconds,
  ADD CONSTRAINT fk_events_plan FOREIGN KEY (pricing_plan_id) REFERENCES pricing_plans(id) ON DELETE SET NULL;

UPDATE events SET pricing_plan_id=(SELECT id FROM pricing_plans WHERE slug='povents-299' LIMIT 1),plan_name='POVents 299';
INSERT INTO user_plan_credits(user_id,pricing_plan_id,credits)
SELECT u.id,p.id,u.event_credits FROM users u JOIN pricing_plans p ON p.slug='povents-299' WHERE u.event_credits>0;
UPDATE payments SET pricing_plan_id=(SELECT id FROM pricing_plans WHERE slug='povents-299' LIMIT 1) WHERE pricing_plan_id IS NULL;
