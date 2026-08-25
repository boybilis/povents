ALTER TABLE photos ADD COLUMN expires_at DATETIME NULL AFTER created_at;
UPDATE photos SET expires_at = DATE_ADD(created_at, INTERVAL 7 DAY) WHERE expires_at IS NULL;
ALTER TABLE photos MODIFY expires_at DATETIME NOT NULL;

CREATE TABLE payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  checkout_id VARCHAR(80) NOT NULL UNIQUE,
  amount INT UNSIGNED NOT NULL,
  status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_payments_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
