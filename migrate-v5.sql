-- POVents migration v5: administrator access
--
-- BEFORE RUNNING:
-- 1. Back up the database.
-- 2. Register the intended administrator through POVents using a real email
--    address and a secure password.
-- 3. Replace the email value below with that registered account's email.
--
-- After promotion, the account can log in using either its real email address
-- or the special username: admin

SET @povents_admin_email = 'replace-with-registered-admin-email@example.com';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin TINYINT(1) NOT NULL DEFAULT 0
  AFTER password_hash;

-- Promote the intended account. All other users remain unchanged.
UPDATE users
SET is_admin = 1
WHERE email = LOWER(TRIM(@povents_admin_email));

-- Verification: this must return exactly the intended administrator.
SELECT id, name, email, is_admin, created_at
FROM users
WHERE is_admin = 1
ORDER BY id;
