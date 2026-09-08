CREATE TABLE IF NOT EXISTS album_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  total_photos INT UNSIGNED NOT NULL DEFAULT 0,
  processed_photos INT UNSIGNED NOT NULL DEFAULT 0,
  total_volumes INT UNSIGNED NOT NULL DEFAULT 0,
  completed_volumes INT UNSIGNED NOT NULL DEFAULT 0,
  cover_data LONGTEXT NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_album_jobs_event (event_id),
  KEY idx_album_jobs_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS album_job_photos (
  job_id BIGINT UNSIGNED NOT NULL,
  photo_id BIGINT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  PRIMARY KEY (job_id, sequence_no),
  UNIQUE KEY uq_album_job_photo (job_id, photo_id),
  KEY idx_album_job_photos_photo (photo_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS album_volumes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  volume_number INT UNSIGNED NOT NULL,
  photo_count INT UNSIGNED NOT NULL DEFAULT 0,
  file_name VARCHAR(255) NULL,
  file_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_album_volume (job_id, volume_number),
  KEY idx_album_volumes_event (event_id, volume_number),
  KEY idx_album_volumes_status (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
