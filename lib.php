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
