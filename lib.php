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

function download_photo_album(array $event): never {
    $s = db()->prepare('SELECT file_name,mime_type,created_at FROM photos WHERE event_id=? AND expires_at>NOW() ORDER BY created_at ASC');
    $s->execute([$event['id']]);
    $photos = array_values(array_filter($s->fetchAll(), static fn(array $photo): bool => is_file(__DIR__.'/uploads/'.$event['id'].'/'.basename($photo['file_name']))));
    if (!$photos) { flash('error', 'This event does not have any available photos yet.'); go('?page=event&id='.$event['id']); }
    if (!extension_loaded('gd')) { http_response_code(500); exit('Photo album compression is not enabled on this server. Enable the PHP GD extension and try again.'); }
    $safeTitle = e((string)$event['title']);
    $date = $event['event_date'] ? date('F j, Y', strtotime((string)$event['event_date'])) : '';
    $fileName = preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$event['title'])).'-offline-album.html';
    if (ob_get_level()) ob_end_clean();
    set_time_limit(0);
    header('Content-Type: text/html; charset=UTF-8');
    header('Content-Disposition: attachment; filename="'.$fileName.'"');
    header('Cache-Control: private, no-store');
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'.$safeTitle.' · Offline photo album</title><style>';
    echo '*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:#151916;color:#eef2ef;font-family:Arial,sans-serif;overflow:hidden}.album{height:100%;display:grid;grid-template-rows:1fr auto;gap:14px;padding:18px}.book{position:relative;min-height:0;perspective:1800px}.page{position:absolute;inset:0;display:none;background:#f7f1e4;color:#17231f;border-radius:8px 24px 24px 8px;padding:clamp(14px,3vw,38px);box-shadow:0 22px 70px #0009,inset 18px 0 28px #8d806522;transform-origin:left center;overflow:hidden}.page.active{display:grid;animation:turnIn .55s ease both}.page.reverse{transform-origin:right center;animation:turnBack .55s ease both}@keyframes turnIn{from{opacity:.25;transform:rotateY(-72deg) scale(.96)}to{opacity:1;transform:none}}@keyframes turnBack{from{opacity:.25;transform:rotateY(72deg) scale(.96)}to{opacity:1;transform:none}}.cover{place-items:center;text-align:center;background:linear-gradient(145deg,#113f31,#071c16);color:#fff;border:10px solid #245b45}.cover img{width:min(420px,70%);filter:drop-shadow(0 4px 8px #0008)}.cover h1{font-family:Georgia,serif;font-size:clamp(40px,8vw,90px);margin:20px 0 8px}.cover p{color:#cbd8d2}.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:clamp(8px,2vw,20px);height:100%}.photo{margin:0;min-height:0;background:#ddd2bd;padding:clamp(6px,1vw,12px);box-shadow:0 6px 18px #594b3630;transform:rotate(var(--tilt))}.photo img{width:100%;height:100%;display:block;object-fit:cover;background:#d7d7d7}.controls{display:flex;align-items:center;justify-content:center;gap:12px}.controls button{border:0;border-radius:999px;padding:12px 18px;background:#dff25f;color:#10251d;font:700 15px Arial;cursor:pointer}.controls button:disabled{opacity:.35}.count{min-width:95px;text-align:center;color:#bec8c2;font-size:14px}.hint{text-align:center;color:#8f9b95;font-size:12px}@media(max-width:600px){.album{padding:10px}.page{border-radius:6px 16px 16px 6px}.grid{gap:8px}.photo{padding:5px}}@media(orientation:landscape){.book{width:min(86vh,900px);justify-self:center;aspect-ratio:4/3}.album{grid-template-rows:minmax(0,1fr) auto}}</style></head><body><main class="album"><section class="book" id="book">';
    echo '<style>.album{display:block;width:100vw;height:100vh;height:100dvh;padding:0}.book{width:100%;height:100%;min-height:100%;}.page{border-radius:0;padding-bottom:110px}.album>footer{position:fixed;z-index:20;left:0;right:0;bottom:0;padding:26px 12px 10px;background:linear-gradient(transparent,#101512 42%);pointer-events:none}.controls,.hint{pointer-events:auto}.controls{flex-wrap:wrap}.controls button{padding:10px 15px}@media(max-width:600px){.album{padding:0}.page{border-radius:0;padding:10px 10px 115px}.cover{padding-bottom:115px}}@media(orientation:landscape){.book{width:100%;height:100%;aspect-ratio:auto}.album{display:block}}</style>';
    echo '<article class="page cover active"><div><img src="data:image/png;base64,'.base64_encode((string)file_get_contents(__DIR__.'/assets/povents-logo-dark.png')).'" alt="POVents"><h1>'.$safeTitle.'</h1><p>'.e($date).'</p><p>'.count($photos).' memories · available offline</p></div></article>';
    foreach (array_chunk($photos, 4) as $pageIndex => $pagePhotos) {
        echo '<article class="page"><div class="grid">';
        foreach ($pagePhotos as $photoIndex => $photo) {
            $path = __DIR__.'/uploads/'.$event['id'].'/'.basename($photo['file_name']);
            $tilt = (($pageIndex * 4 + $photoIndex) % 2 === 0) ? '-0.5deg' : '0.5deg';
            echo '<figure class="photo" style="--tilt:'.$tilt.'"><img src="'.album_photo_data_uri($path).'" alt="Event photo"></figure>';
            if (function_exists('ob_flush')) @ob_flush(); flush();
        }
        echo '</div></article>';
    }
    echo '</section><footer><div class="controls"><button id="prev" type="button">← Previous</button><span class="count" id="count"></span><button id="next" type="button">Next →</button><button id="full" type="button">⛶ Fullscreen</button></div><p class="hint">Swipe or use the arrow keys to turn pages · On mobile, use Fullscreen then rotate landscape</p></footer></main><script>(()=>{const p=[...document.querySelectorAll(".page")],prev=document.querySelector("#prev"),next=document.querySelector("#next"),full=document.querySelector("#full"),count=document.querySelector("#count");let i=0,startX=0;function show(n,reverse=false){i=Math.max(0,Math.min(p.length-1,n));p.forEach((el,x)=>{el.classList.toggle("active",x===i);el.classList.toggle("reverse",x===i&&reverse)});prev.disabled=i===0;next.disabled=i===p.length-1;count.textContent=`${i+1} / ${p.length}`}prev.onclick=()=>show(i-1,true);next.onclick=()=>show(i+1);full.onclick=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();screen.orientation?.unlock?.()}else{await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.("landscape")}}catch(_){full.textContent="Rotate landscape"}};addEventListener("fullscreenchange",()=>{full.textContent=document.fullscreenElement?"Exit fullscreen":"⛶ Fullscreen"});addEventListener("keydown",e=>{if(e.key==="ArrowLeft")show(i-1,true);if(e.key==="ArrowRight")show(i+1);if(e.key==="f")full.click()});document.querySelector("#book").addEventListener("touchstart",e=>startX=e.touches[0].clientX,{passive:true});document.querySelector("#book").addEventListener("touchend",e=>{const d=e.changedTouches[0].clientX-startX;if(Math.abs(d)>45)show(i+(d<0?1:-1),d>0)},{passive:true});show(0)})();</script></body></html>';
    exit;
}

function album_photo_data_uri(string $path): string {
    $bytes = @file_get_contents($path);
    $source = is_string($bytes) ? @imagecreatefromstring($bytes) : false;
    if (!$source) throw new RuntimeException('An album photo could not be processed.');
    $sourceWidth = imagesx($source); $sourceHeight = imagesy($source);
    $portrait = $sourceHeight >= $sourceWidth;
    $targetWidth = $portrait ? 480 : 640; $targetHeight = $portrait ? 640 : 480;
    $targetRatio = $targetWidth / $targetHeight; $sourceRatio = $sourceWidth / $sourceHeight;
    $sourceX = 0; $sourceY = 0; $cropWidth = $sourceWidth; $cropHeight = $sourceHeight;
    if ($sourceRatio > $targetRatio) { $cropWidth = (int)round($sourceHeight * $targetRatio); $sourceX = (int)(($sourceWidth - $cropWidth) / 2); }
    elseif ($sourceRatio < $targetRatio) { $cropHeight = (int)round($sourceWidth / $targetRatio); $sourceY = (int)(($sourceHeight - $cropHeight) / 2); }
    $resized = imagecreatetruecolor($targetWidth, $targetHeight);
    $white = imagecolorallocate($resized, 255, 255, 255); imagefill($resized, 0, 0, $white);
    imagecopyresampled($resized, $source, 0, 0, $sourceX, $sourceY, $targetWidth, $targetHeight, $cropWidth, $cropHeight);
    ob_start(); imagejpeg($resized, null, 76); $jpeg = (string)ob_get_clean();
    imagedestroy($source); imagedestroy($resized);
    return 'data:image/jpeg;base64,'.base64_encode($jpeg);
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
