<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
if (!hash_equals((string)cfg('cron_secret'), $_GET['key'] ?? '')) { http_response_code(403); exit('Forbidden'); }
header('Content-Type: text/plain');
$albums = process_album_jobs(1);
$photos = purge_expired_photos(100);
echo 'Created '.$albums.' album volume(s). Deleted '.$photos.' expired photos.';
