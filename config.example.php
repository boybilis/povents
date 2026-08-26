<?php
return [
    'app_name' => 'POVents',
    'base_url' => 'https://your-domain.com',
    'timezone' => 'Asia/Manila',
    'db' => [
        'host' => 'localhost',
        'name' => 'u123456789_povents',
        'user' => 'u123456789_povents',
        'pass' => 'change-me',
        'charset' => 'utf8mb4',
    ],
    'paymongo_secret_key' => 'sk_test_replace_me',
    'paymongo_webhook_secret' => 'whsk_replace_me',
    'smtp' => [
        'host' => 'smtp.hostinger.com',
        'port' => 587,
        'encryption' => 'tls',
        'username' => 'no-reply@your-domain.com',
        'password' => 'replace-with-mailbox-password',
        'from_email' => 'no-reply@your-domain.com',
        'from_name' => 'POVents',
    ],
    // Keep false on Hostinger. This is only for local development.
    'local_payment_bypass' => false,
    'plan_price_centavos' => 69900,
    'plan_days' => 30,
    'photo_retention_days' => 7,
    'cron_secret' => 'replace-with-a-long-random-string',
    'max_photos_per_session' => 5,
    'max_upload_bytes' => 1536 * 1024,
];
