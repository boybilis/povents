# POVents — Hostinger upload package

## Install

1. In Hostinger, create a MySQL database and database user.
2. Open phpMyAdmin, select that database, and import `schema.sql`.
3. Copy `config.example.php` to `config.php`; enter the database details, HTTPS domain, PayMongo secret key, and webhook secret.
4. Upload the **contents** of this folder to `public_html`.
5. Ensure PHP 8.1+ is selected and the `uploads` folder is writable (usually permission 755).
6. In PayMongo, register `https://your-domain.com/webhook.php` for `checkout_session.payment.paid` and copy its signing secret into the config.
7. In Hostinger Cron Jobs, request `https://your-domain.com/cleanup.php?key=YOUR_CRON_SECRET` hourly. The app also cleans on normal page visits, but cron guarantees timely deletion.
8. Visit the domain, register, pay with PayMongo test mode, create an event, and test its QR code on a phone.

## Existing installation

If the original schema was already imported, run `migrate-v2.sql` once instead of importing `schema.sql` again.

## Payments and retention

The checkout uses PayMongo-hosted QRPh payment pages. The plan is activated only by a signed `checkout_session.payment.paid` webhook. Start with `sk_test_...`, then replace it with a live secret key when your PayMongo account and QRPh payment method are approved.

Every photo receives its own seven-day expiry timestamp. The organizer gallery shows the remaining time; expired database records and image files are permanently removed.

Camera access requires HTTPS, which Hostinger provides through SSL. Uploaded files are type-checked, randomly named, and executable file types are blocked by `.htaccess`.
