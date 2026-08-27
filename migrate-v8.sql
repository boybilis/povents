ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS max_guest_scans INT UNSIGNED NOT NULL DEFAULT 50 COMMENT '0 means unlimited' AFTER passes_per_purchase;

ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS photo_albums_per_event SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER reels_per_event;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS max_guest_scans INT UNSIGNED NOT NULL DEFAULT 50 COMMENT '0 means unlimited' AFTER plan_name;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS photo_albums_allowed SMALLINT UNSIGNED NOT NULL DEFAULT 1 AFTER reels_allowed;

UPDATE pricing_plans
SET name='POVents 299',
    slug='povents-299',
    description='One event for up to 50 guest scan sessions, with three reels and one saved photo album.',
    price_centavos=29900,
    passes_per_purchase=1,
    max_guest_scans=50,
    max_photos_per_session=5,
    photo_retention_days=7,
    reels_per_event=3,
    photo_albums_per_event=1,
    reel_duration_seconds=30,
    reel_image_count=20,
    is_active=1,
    is_featured=1,
    display_order=10
WHERE slug='povents-event-pass';

UPDATE pricing_plans
SET name='POVents 299',
    description='One event for up to 50 guest scan sessions, with three reels and one saved photo album.',
    price_centavos=29900,
    passes_per_purchase=1,
    max_guest_scans=50,
    max_photos_per_session=5,
    photo_retention_days=7,
    reels_per_event=3,
    photo_albums_per_event=1,
    reel_duration_seconds=30,
    reel_image_count=20,
    is_active=1,
    is_featured=1,
    display_order=10
WHERE slug='povents-299';

INSERT INTO pricing_plans
  (name,slug,description,price_centavos,passes_per_purchase,max_guest_scans,max_photos_per_session,photo_retention_days,reels_per_event,photo_albums_per_event,reel_duration_seconds,reel_image_count,is_active,is_featured,display_order)
VALUES
  ('POVents 899 Unlimited','povents-899-unlimited','One event with unlimited guest scan sessions, unlimited reels, and one saved photo album.',89900,1,0,5,7,0,1,30,20,1,0,20)
ON DUPLICATE KEY UPDATE
  name=VALUES(name),
  description=VALUES(description),
  price_centavos=VALUES(price_centavos),
  passes_per_purchase=VALUES(passes_per_purchase),
  max_guest_scans=VALUES(max_guest_scans),
  max_photos_per_session=VALUES(max_photos_per_session),
  photo_retention_days=VALUES(photo_retention_days),
  reels_per_event=VALUES(reels_per_event),
  photo_albums_per_event=VALUES(photo_albums_per_event),
  reel_duration_seconds=VALUES(reel_duration_seconds),
  reel_image_count=VALUES(reel_image_count),
  is_active=VALUES(is_active),
  is_featured=VALUES(is_featured),
  display_order=VALUES(display_order);

UPDATE events e
JOIN pricing_plans p ON p.id=e.pricing_plan_id
SET e.plan_name=p.name,
    e.max_guest_scans=p.max_guest_scans,
    e.photo_albums_allowed=p.photo_albums_per_event
WHERE p.slug IN ('povents-299','povents-899-unlimited');
