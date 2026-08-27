ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS reels_unlimited TINYINT(1) NOT NULL DEFAULT 0 AFTER reels_per_event;

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reels_unlimited TINYINT(1) NOT NULL DEFAULT 0 AFTER reels_allowed;

UPDATE pricing_plans
SET name='POVents 299',
    description='One event for up to 50 guest scan sessions, with one saved photo album.',
    price_centavos=29900,
    passes_per_purchase=1,
    max_guest_scans=50,
    max_photos_per_session=5,
    photo_retention_days=7,
    reels_per_event=0,
    reels_unlimited=0,
    photo_albums_per_event=1,
    reel_duration_seconds=30,
    reel_image_count=20,
    is_active=1,
    is_featured=0,
    display_order=10
WHERE slug='povents-299';

INSERT INTO pricing_plans
  (name,slug,description,price_centavos,passes_per_purchase,max_guest_scans,max_photos_per_session,photo_retention_days,reels_per_event,reels_unlimited,photo_albums_per_event,reel_duration_seconds,reel_image_count,is_active,is_featured,display_order)
VALUES
  ('POVents 599','povents-599','One event for up to 100 guest scan sessions, with three reels and one saved photo album.',59900,1,100,5,7,3,0,1,30,20,1,1,20)
ON DUPLICATE KEY UPDATE
  name=VALUES(name),description=VALUES(description),price_centavos=VALUES(price_centavos),passes_per_purchase=VALUES(passes_per_purchase),
  max_guest_scans=VALUES(max_guest_scans),max_photos_per_session=VALUES(max_photos_per_session),photo_retention_days=VALUES(photo_retention_days),
  reels_per_event=VALUES(reels_per_event),reels_unlimited=VALUES(reels_unlimited),photo_albums_per_event=VALUES(photo_albums_per_event),
  reel_duration_seconds=VALUES(reel_duration_seconds),reel_image_count=VALUES(reel_image_count),is_active=VALUES(is_active),is_featured=VALUES(is_featured),display_order=VALUES(display_order);

UPDATE pricing_plans
SET name='POVents 899 Unlimited',
    description='One event with unlimited guest scan sessions, unlimited reels, one saved photo album, and 15-day original-photo storage.',
    price_centavos=89900,
    passes_per_purchase=1,
    max_guest_scans=0,
    max_photos_per_session=5,
    photo_retention_days=15,
    reels_per_event=0,
    reels_unlimited=1,
    photo_albums_per_event=1,
    reel_duration_seconds=30,
    reel_image_count=20,
    is_active=1,
    is_featured=0,
    display_order=30
WHERE slug='povents-899-unlimited';

UPDATE events e
JOIN pricing_plans p ON p.id=e.pricing_plan_id
SET e.reels_unlimited=p.reels_unlimited
WHERE p.slug IN ('povents-299','povents-599','povents-899-unlimited');
