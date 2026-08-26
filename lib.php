<?php
declare(strict_types=1);

function cfg(?string $key = null): mixed {
    static $config;
    if (!$config) {
        $file = __DIR__ . '/config.php';
        if (!is_file($file)) {
            http_response_code(500);
            exit('Copy config.example.php to config.php and enter your database details.');
        }
        $config = require $file;
        date_default_timezone_set($config['timezone'] ?? 'Asia/Manila');
    }
    return $key === null ? $config : ($config[$key] ?? null);
}

function event_day_status(array $event): string {
    if (!$event['event_date']) return 'open';
    $now = new DateTimeImmutable('now');
    $start = new DateTimeImmutable($event['event_date'] . ' ' . ($event['start_time'] ?? '00:00:00'));
    $end = new DateTimeImmutable($event['event_date'] . ' ' . ($event['end_time'] ?? '23:59:59'));
    return $now < $start ? 'upcoming' : ($now > $end ? 'finished' : 'open');
}

function db(): PDO {
    static $pdo;
    if (!$pdo) {
        $d = cfg('db');
        $dsn = "mysql:host={$d['host']};dbname={$d['name']};charset={$d['charset']}";
        $pdo = new PDO($dsn, $d['user'], $d['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}

function e(?string $value): string { return htmlspecialchars($value ?? '', ENT_QUOTES, 'UTF-8'); }
function url(string $path = ''): string { return rtrim((string)cfg('base_url'), '/') . '/' . ltrim($path, '/'); }
function go(string $to): never { header('Location: ' . $to); exit; }
function user(): ?array { return $_SESSION['user'] ?? null; }
function require_user(): array { if (!user()) go('?page=login'); return user(); }
function csrf(): string { return $_SESSION['csrf'] ??= bin2hex(random_bytes(24)); }
function check_csrf(): void { if (!hash_equals($_SESSION['csrf'] ?? '', $_POST['csrf'] ?? '')) { http_response_code(419); exit('Your session expired. Please refresh and try again.'); } }
function flash(string $type, string $message): void { $_SESSION['flash'] = compact('type', 'message'); }
function pull_flash(): ?array { $f = $_SESSION['flash'] ?? null; unset($_SESSION['flash']); return $f; }
function active_subscription(array $u): bool {
    return $u['subscription_status'] === 'active' && (int)($u['event_credits'] ?? 0) > 0 && (!$u['subscription_ends_at'] || strtotime($u['subscription_ends_at']) > time());
}
function local_payment_bypass(): bool {
    if (cfg('local_payment_bypass') !== true) return false;
    $host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
    return in_array($host, ['localhost', '127.0.0.1', '::1'], true) || filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE) === false && filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
}
function refresh_user(int $id): void {
    $s = db()->prepare('SELECT id,name,email,subscription_status,subscription_ends_at,event_credits FROM users WHERE id=?');
    $s->execute([$id]); $_SESSION['user'] = $s->fetch();
}
function event_for_owner(int $id, int $userId): ?array {
    $s = db()->prepare('SELECT * FROM events WHERE id=? AND user_id=?'); $s->execute([$id, $userId]);
    return $s->fetch() ?: null;
}

function download_event_qr(array $event, string $guestUrl): never {
    $qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=900x900&margin=18&data='.rawurlencode($guestUrl);
    $ch = curl_init($qrUrl);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER=>true,CURLOPT_TIMEOUT=>20,CURLOPT_FOLLOWLOCATION=>true,CURLOPT_USERAGENT=>'POVents QR Generator']);
    $qrBytes = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); curl_close($ch);
    $logoBytes = @file_get_contents(__DIR__.'/assets/povents-logo.png');
    if (!is_string($qrBytes) || $status !== 200 || !is_string($logoBytes)) { http_response_code(502); exit('The branded QR image could not be created. Please try again.'); }
    $title = e((string)$event['title']);
    $date = date('F j, Y', strtotime((string)$event['event_date']));
    $times = date('g:i A', strtotime((string)$event['start_time'])).' - '.date('g:i A', strtotime((string)$event['end_time']));
    $titleSize = max(34, min(58, (int)floor(900 / max(1, strlen((string)$event['title'])) * 1.7)));
    $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1500" viewBox="0 0 1200 1500">'
        .'<rect width="1200" height="1500" rx="42" fill="#fffdf8"/>'
        .'<image href="data:image/png;base64,'.base64_encode($logoBytes).'" x="290" y="45" width="620" height="224" preserveAspectRatio="xMidYMid meet"/>'
        .'<rect x="126" y="276" width="948" height="948" rx="32" fill="#fff" stroke="#d9ddd4" stroke-width="4"/>'
        .'<image href="data:image/png;base64,'.base64_encode($qrBytes).'" x="150" y="300" width="900" height="900"/>'
        .'<text x="600" y="1305" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="'.$titleSize.'" font-weight="700" fill="#072a20">'.$title.'</text>'
        .'<text x="600" y="1375" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#63706b">'.e($date.'  |  '.$times).'</text>'
        .'<text x="600" y="1440" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="22" fill="#63706b">Scan to share your point of view</text>'
        .'</svg>';
    $fileName = preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$event['title'])).'-QR.svg';
    if (ob_get_level()) ob_end_clean();
    header('Content-Type: image/svg+xml; charset=UTF-8'); header('Content-Disposition: attachment; filename="'.$fileName.'"'); header('Cache-Control: private, no-store');
    echo $svg; exit;
}

function paymongo(string $method, string $path, ?array $body = null): array {
    $ch = curl_init('https://api.paymongo.com/v1/' . ltrim($path, '/'));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTPHEADER => ['Accept: application/json','Content-Type: application/json','Authorization: Basic ' . base64_encode(cfg('paymongo_secret_key') . ':')],
    ]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $raw = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE); $error = curl_error($ch); curl_close($ch);
    if ($raw === false || $code < 200 || $code >= 300) throw new RuntimeException($error ?: 'PayMongo could not start checkout.');
    return json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
}

function purge_expired_photos(int $maxBatches = 1): int {
    $delete = db()->prepare('DELETE FROM photos WHERE id=?'); $count = 0;
    for ($batch=0; $batch<$maxBatches; $batch++) {
        $rows = db()->query('SELECT id,event_id,file_name FROM photos WHERE expires_at<=NOW() LIMIT 500')->fetchAll();
        if (!$rows) break;
        foreach ($rows as $row) {
            $path = __DIR__ . '/uploads/' . $row['event_id'] . '/' . basename($row['file_name']);
            if (is_file($path)) @unlink($path);
            $delete->execute([$row['id']]); $count++;
        }
        if (count($rows) < 500) break;
    }
    return $count;
}
