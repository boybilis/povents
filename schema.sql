CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_admin TINYINT(1) NOT NULL DEFAULT 0,
  subscription_status ENUM('inactive','active','past_due') NOT NULL DEFAULT 'inactive',
  subscription_ends_at DATETIME NULL,
  event_credits INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE events (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  title VARCHAR(160) NOT NULL,
  event_date DATE NULL,
  start_time TIME NOT NULL DEFAULT '00:00:00',
  end_time TIME NOT NULL DEFAULT '23:59:59',
  location VARCHAR(190) NULL,
  token CHAR(32) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  reels_created TINYINT UNSIGNED NOT NULL DEFAULT 0,
  pricing_plan_id INT UNSIGNED NULL,
  plan_name VARCHAR(100) NOT NULL DEFAULT 'Event Pass',
  max_guest_scans INT UNSIGNED NOT NULL DEFAULT 50 COMMENT '0 means unlimited',
  max_photos_per_session SMALLINT UNSIGNED NOT NULL DEFAULT 5,
  photo_retention_days SMALLINT UNSIGNED NOT NULL DEFAULT 7,
  reels_allowed SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  photo_albums_allowed SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  reel_duration_seconds SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  reel_image_count SMALLINT UNSIGNED NOT NULL DEFAULT 20,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_plan FOREIGN KEY (pricing_plan_id) REFERENCES pricing_plans(id) ON DELETE SET NULL,
  INDEX idx_events_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE capture_sessions (
  id CHAR(32) PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  photo_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_sessions_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  INDEX idx_sessions_event (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE photos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_id INT UNSIGNED NOT NULL,
  capture_session_id CHAR(32) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(40) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_photos_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_photos_session FOREIGN KEY (capture_session_id) REFERENCES capture_sessions(id) ON DELETE CASCADE,
  INDEX idx_photos_event_created (event_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  pricing_plan_id INT UNSIGNED NULL,
  checkout_id VARCHAR(80) NOT NULL UNIQUE,
  amount INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_plan FOREIGN KEY (pricing_plan_id) REFERENCES pricing_plans(id) ON DELETE SET NULL,
  INDEX idx_payments_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_plan_credits (
  user_id INT UNSIGNED NOT NULL,
  pricing_plan_id INT UNSIGNED NOT NULL,
  credits INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id,pricing_plan_id),
  CONSTRAINT fk_plan_credits_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_plan_credits_plan FOREIGN KEY (pricing_plan_id) REFERENCES pricing_plans(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
