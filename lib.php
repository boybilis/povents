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
function is_admin(array $u): bool { return (int)($u['is_admin'] ?? 0) === 1; }
function active_subscription(array $u): bool {
    return is_admin($u) || (int)($u['event_credits'] ?? 0) > 0;
}
function local_payment_bypass(): bool {
    if (cfg('local_payment_bypass') !== true) return false;
    $host = strtolower(explode(':', $_SERVER['HTTP_HOST'] ?? '')[0]);
    return in_array($host, ['localhost', '127.0.0.1', '::1'], true) || filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE) === false && filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
}
function refresh_user(int $id): void {
    $s = db()->prepare('SELECT id,name,email,is_admin,subscription_status,subscription_ends_at,event_credits FROM users WHERE id=?');
    $s->execute([$id]); $_SESSION['user'] = $s->fetch();
}
function event_for_owner(int $id, int $userId): ?array {
    $s = db()->prepare('SELECT * FROM events WHERE id=? AND user_id=?'); $s->execute([$id, $userId]);
    return $s->fetch() ?: null;
}

function send_registration_otp(string $name, string $email, string $otp): void {
    $autoload = __DIR__.'/vendor/autoload.php';
    if (!is_file($autoload)) throw new RuntimeException('Email service is not installed.');
    require_once $autoload;
    $smtp = cfg('smtp');
    $smtpConfigured = is_array($smtp) && filter_var($smtp['from_email'] ?? '', FILTER_VALIDATE_EMAIL) && !empty($smtp['username']) && !empty($smtp['password']);
    $mail = new \PHPMailer\PHPMailer\PHPMailer(true);
    try {
        if ($smtpConfigured) {
            $mail->isSMTP();
            $mail->Host = (string)($smtp['host'] ?? 'smtp.hostinger.com');
            $mail->Port = (int)($smtp['port'] ?? 587);
            $mail->SMTPAuth = true;
            $mail->Username = (string)$smtp['username'];
            $mail->Password = (string)$smtp['password'];
            $mail->SMTPSecure = strtolower((string)($smtp['encryption'] ?? 'tls')) === 'ssl'
                ? \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS
                : \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
            $fromEmail = (string)$smtp['from_email']; $fromName = (string)($smtp['from_name'] ?? 'POVents');
        } else {
            $mail->isMail();
            $host = preg_replace('/^www\./', '', (string)(parse_url((string)cfg('base_url'), PHP_URL_HOST) ?: 'localhost.localdomain'));
            $fromEmail = 'no-reply@'.$host; $fromName = 'POVents';
        }
        $mail->Timeout = 20; $mail->CharSet = 'UTF-8';
        $mail->setFrom($fromEmail, $fromName);
        $mail->addAddress($email, $name);
        $mail->isHTML(true);
        $mail->Subject = 'Your POVents verification code';
        $safeName = e($name); $safeOtp = e($otp);
        $mail->Body = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#17231f"><h1 style="color:#245b45">Welcome to POVents</h1><p>Hello '.$safeName.',</p><p>Use this verification code to complete your registration:</p><p style="font-size:36px;font-weight:800;letter-spacing:8px;background:#f4f1e9;padding:18px;text-align:center;border-radius:14px">'.$safeOtp.'</p><p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>';
        $mail->AltBody = "Hello {$name},\n\nYour POVents verification code is: {$otp}\n\nThis code expires in 10 minutes.";
        $mail->send();
    } catch (\PHPMailer\PHPMailer\Exception $e) {
        throw new RuntimeException('The verification email could not be sent. Please try again.');
    }
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

function shared_album_signature(array $event, int $expires): string {
    $secret = (string)cfg('cron_secret');
    if (strlen($secret) < 32) throw new RuntimeException('Set a long cron_secret before creating shareable album links.');
    return hash_hmac('sha256', $event['id'].'|'.$expires.'|'.$event['token'], $secret);
}

function shared_album_url(array $event): string {
    $expires = (new DateTimeImmutable($event['event_date'].' 23:59:59'))->modify('+'.(int)cfg('photo_retention_days').' days')->getTimestamp();
    return url('?action=download_shared_album&event_id='.$event['id'].'&expires='.$expires.'&signature='.shared_album_signature($event, $expires));
}

function album_storage_path(int $eventId): string {
    return __DIR__.'/albums/event-'.$eventId.'.html';
}

function album_download_name(array $event): string {
    return preg_replace('/[^A-Za-z0-9_-]+/', '-', trim((string)$event['title'])).'-offline-album.html';
}

function serve_saved_photo_album(array $event, string $path): never {
    if (ob_get_level()) ob_end_clean();
    header('Content-Type: text/html; charset=UTF-8');
    header('Content-Disposition: attachment; filename="'.album_download_name($event).'"');
    header('Content-Length: '.filesize($path));
    header('Cache-Control: private, no-store');
    readfile($path);
    exit;
}

function download_photo_album(array $event, bool $shared = false): never {
    $s = db()->prepare('SELECT file_name,mime_type,created_at FROM photos WHERE event_id=? AND expires_at>NOW() ORDER BY created_at ASC');
    $s->execute([$event['id']]);
    $photos = array_values(array_filter($s->fetchAll(), static fn(array $photo): bool => is_file(__DIR__.'/uploads/'.$event['id'].'/'.basename($photo['file_name']))));
    if (!$photos) {
        $savedAlbum = album_storage_path((int)$event['id']);
        if (is_file($savedAlbum)) serve_saved_photo_album($event, $savedAlbum);
        if ($shared) { http_response_code(404); exit('This photo album does not have any available photos.'); }
        flash('error', 'No saved photo album is available for this event.'); go('?page=event&id='.$event['id']);
    }
    if (!extension_loaded('gd')) { http_response_code(500); exit('Photo album compression is not enabled on this server. Enable the PHP GD extension and try again.'); }
    $byOrientation = ['portrait'=>[], 'landscape'=>[]];
    foreach ($photos as $photo) {
        $size = @getimagesize(__DIR__.'/uploads/'.$event['id'].'/'.basename($photo['file_name']));
        $orientation = $size && $size[1] > $size[0] ? 'portrait' : 'landscape';
        $byOrientation[$orientation][] = $photo;
    }
    $firstSize = @getimagesize(__DIR__.'/uploads/'.$event['id'].'/'.basename($photos[0]['file_name']));
    $orientationOrder = $firstSize && $firstSize[1] > $firstSize[0] ? ['portrait','landscape'] : ['landscape','portrait'];
    $albumPages = [];
    foreach ($orientationOrder as $orientation) {
        $photosPerPage = $orientation === 'portrait' ? 4 : 3;
        foreach (array_chunk($byOrientation[$orientation], $photosPerPage) as $items) $albumPages[] = ['orientation'=>$orientation,'photos'=>$items];
    }
    $safeTitle = e((string)$event['title']);
    $date = $event['event_date'] ? date('F j, Y', strtotime((string)$event['event_date'])) : '';
    if (ob_get_level()) ob_end_clean();
    set_time_limit(0);
    ob_start();
    echo '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>'.$safeTitle.' · Offline photo album</title><style>';
    echo '*{box-sizing:border-box}html,body{height:100%}body{margin:0;background:#151916;color:#eef2ef;font-family:Arial,sans-serif;overflow:hidden}.album{height:100%;display:grid;grid-template-rows:1fr auto;gap:14px;padding:18px}.book{position:relative;min-height:0;perspective:1800px}.page{position:absolute;inset:0;display:none;background:#f7f1e4;color:#17231f;border-radius:8px 24px 24px 8px;padding:clamp(14px,3vw,38px);box-shadow:0 22px 70px #0009,inset 18px 0 28px #8d806522;transform-origin:left center;overflow:hidden}.page.active{display:grid;animation:turnIn .55s ease both}.page.reverse{transform-origin:right center;animation:turnBack .55s ease both}@keyframes turnIn{from{opacity:.25;transform:rotateY(-72deg) scale(.96)}to{opacity:1;transform:none}}@keyframes turnBack{from{opacity:.25;transform:rotateY(72deg) scale(.96)}to{opacity:1;transform:none}}.cover{place-items:center;text-align:center;background:linear-gradient(145deg,#113f31,#071c16);color:#fff;border:10px solid #245b45}.cover img{width:min(420px,70%);filter:drop-shadow(0 4px 8px #0008)}.cover h1{font-family:Georgia,serif;font-size:clamp(40px,8vw,90px);margin:20px 0 8px}.cover p{color:#cbd8d2}.grid{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:clamp(8px,2vw,20px);height:100%}.photo{margin:0;min-height:0;background:#ddd2bd;padding:clamp(6px,1vw,12px);box-shadow:0 6px 18px #594b3630;transform:rotate(var(--tilt))}.photo img{width:100%;height:100%;display:block;object-fit:cover;background:#d7d7d7}.controls{display:flex;align-items:center;justify-content:center;gap:12px}.controls button{border:0;border-radius:999px;padding:12px 18px;background:#dff25f;color:#10251d;font:700 15px Arial;cursor:pointer}.controls button:disabled{opacity:.35}.count{min-width:95px;text-align:center;color:#bec8c2;font-size:14px}.hint{text-align:center;color:#8f9b95;font-size:12px}@media(max-width:600px){.album{padding:10px}.page{border-radius:6px 16px 16px 6px}.grid{gap:8px}.photo{padding:5px}}@media(orientation:landscape){.book{width:min(86vh,900px);justify-self:center;aspect-ratio:4/3}.album{grid-template-rows:minmax(0,1fr) auto}}</style></head><body><main class="album"><section class="book" id="book">';
    echo '<style>.album{display:block;width:100vw;height:100vh;height:100dvh;padding:0}.book{width:100%;height:100%;min-height:100%;}.page{border-radius:0;padding-bottom:110px}.album>footer{position:fixed;z-index:20;left:0;right:0;bottom:0;padding:26px 12px 10px;background:linear-gradient(transparent,#101512 42%);pointer-events:none}.controls,.hint{pointer-events:auto}.controls{flex-wrap:wrap}.controls button{padding:10px 15px}@media(max-width:600px){.album{padding:0}.page{border-radius:0;padding:10px 10px 115px}.cover{padding-bottom:115px}}@media(orientation:landscape){.book{width:100%;height:100%;aspect-ratio:auto}.album{display:block}}</style>';
    echo '<style>.page{border:0;box-shadow:none}.cover{border:0}.page:not(.cover){grid-template-rows:auto minmax(0,1fr)}.album-page-header{display:flex;align-items:center;justify-content:space-between;gap:24px;height:58px;padding:0 4px 10px}.album-page-logo{display:block;width:155px;height:48px;background:url("data:image/png;base64,'.base64_encode((string)file_get_contents(__DIR__.'/assets/povents-logo.png')).'") left center/contain no-repeat;flex:0 0 auto}.album-page-header strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;font-family:Georgia,serif;font-size:clamp(20px,2.4vw,34px);font-weight:600}.grid{width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}.photo{display:flex;align-items:center;justify-content:center;min-width:0;min-height:0;overflow:hidden;padding:0;background:transparent;box-shadow:none;transform:none}.photo img{width:auto;height:auto;max-width:100%;max-height:100%;object-fit:contain;border:3px solid #fff;border-radius:8px;background:transparent}.portrait-page .grid{grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:10px}.landscape-page .grid{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:minmax(0,1fr);gap:10px}@media(max-width:700px){.album-page-header{height:46px}.album-page-logo{width:115px;height:36px}.album-page-header strong{font-size:18px}}</style>';
    echo '<style>.book{perspective:2400px;transform-style:preserve-3d;isolation:isolate}.page{backface-visibility:hidden;transform-style:preserve-3d}.page.active{display:grid;animation:none}.page.turn-under,.page.flip-forward,.page.flip-back-in{display:grid}.page.turn-under{z-index:1}.page.flip-forward{z-index:3;transform-origin:left center;animation:realPageForward .9s cubic-bezier(.45,.05,.2,1) both}.page.flip-back-in{z-index:3;transform-origin:left center;animation:realPageBack .9s cubic-bezier(.25,.72,.2,1) both}.page.flip-forward:after,.page.flip-back-in:after{content:"";position:absolute;z-index:30;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(0,0,0,.28),rgba(255,255,255,.14) 12%,transparent 38%,rgba(0,0,0,.12));animation:pageFoldShade .9s ease both}.page.flip-forward:before,.page.flip-back-in:before{content:"";position:absolute;z-index:31;top:0;bottom:0;left:0;width:12px;pointer-events:none;background:linear-gradient(90deg,#0006,#fff5,transparent)}@keyframes realPageForward{0%{transform:rotateY(0) translateZ(1px);filter:brightness(1);box-shadow:0 16px 50px #0007}45%{transform:rotateY(-48deg) translateX(-1.2%) skewY(.8deg);filter:brightness(.94);box-shadow:28px 12px 55px #0009}75%{transform:rotateY(-82deg) translateX(-2.2%) skewY(1.3deg);filter:brightness(.78);box-shadow:44px 8px 60px #000b}100%{transform:rotateY(-104deg) translateX(-3%);filter:brightness(.62);box-shadow:55px 4px 65px #000b}}@keyframes realPageBack{0%{transform:rotateY(-104deg) translateX(-3%);filter:brightness(.62);box-shadow:55px 4px 65px #000b}28%{transform:rotateY(-80deg) translateX(-2.2%) skewY(1.2deg);filter:brightness(.78);box-shadow:44px 8px 60px #000b}62%{transform:rotateY(-42deg) translateX(-1%) skewY(.6deg);filter:brightness(.95);box-shadow:25px 12px 52px #0009}100%{transform:rotateY(0) translateZ(1px);filter:brightness(1);box-shadow:0 16px 50px #0007}}@keyframes pageFoldShade{0%,100%{opacity:0}35%,72%{opacity:1}}@media(prefers-reduced-motion:reduce){.page.flip-forward,.page.flip-back-in{animation-duration:.01ms}.page.flip-forward:after,.page.flip-back-in:after{animation-duration:.01ms}}</style>';
    echo '<article class="page cover active"><div><img src="data:image/png;base64,'.base64_encode((string)file_get_contents(__DIR__.'/assets/povents-logo-dark.png')).'" alt="POVents"><h1>'.$safeTitle.'</h1><p>'.e($date).'</p><p>'.count($photos).' memories · available offline</p></div></article>';
    foreach ($albumPages as $pageIndex => $albumPage) {
        $pagePhotos = $albumPage['photos'];
        echo '<article class="page '.$albumPage['orientation'].'-page"><header class="album-page-header"><span class="album-page-logo" role="img" aria-label="POVents"></span><strong>'.$safeTitle.'</strong></header><div class="grid">';
        foreach ($pagePhotos as $photoIndex => $photo) {
            $path = __DIR__.'/uploads/'.$event['id'].'/'.basename($photo['file_name']);
            $tilt = (($pageIndex * 4 + $photoIndex) % 2 === 0) ? '-0.5deg' : '0.5deg';
            echo '<figure class="photo" style="--tilt:'.$tilt.'"><img src="'.album_photo_data_uri($path).'" alt="Event photo"></figure>';
        }
        echo '</div></article>';
    }
    echo '</section><footer><div class="controls"><button id="prev" type="button">← Previous</button><span class="count" id="count"></span><button id="next" type="button">Next →</button><button id="full" type="button">⛶ Fullscreen</button></div><p class="hint">Swipe or use the arrow keys to turn pages · On mobile, use Fullscreen then rotate landscape</p></footer></main><script>(()=>{const p=[...document.querySelectorAll(".page")],prev=document.querySelector("#prev"),next=document.querySelector("#next"),full=document.querySelector("#full"),count=document.querySelector("#count");let i=0,startX=0,busy=false,timer;function controls(){prev.disabled=busy||i===0;next.disabled=busy||i===p.length-1;count.textContent=`${i+1} / ${p.length}`}function show(n){n=Math.max(0,Math.min(p.length-1,n));if(n===i||busy)return;busy=true;controls();const from=p[i],to=p[n],back=n<i;let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);from.classList.remove("active","flip-forward");to.classList.remove("turn-under","flip-back-in");to.classList.add("active");from.style.zIndex="";to.style.zIndex="";i=n;busy=false;controls()};if(back){from.style.zIndex="1";to.classList.add("flip-back-in");to.addEventListener("animationend",finish,{once:true})}else{to.classList.add("turn-under");from.classList.add("flip-forward");from.addEventListener("animationend",finish,{once:true})}timer=setTimeout(finish,1100)}prev.onclick=()=>show(i-1);next.onclick=()=>show(i+1);full.onclick=async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();screen.orientation?.unlock?.()}else{await document.documentElement.requestFullscreen?.();await screen.orientation?.lock?.("landscape")}}catch(_){full.textContent="Rotate landscape"}};addEventListener("fullscreenchange",()=>{full.textContent=document.fullscreenElement?"Exit fullscreen":"⛶ Fullscreen"});addEventListener("keydown",e=>{if(e.key==="ArrowLeft")show(i-1);if(e.key==="ArrowRight")show(i+1);if(e.key==="f")full.click()});document.querySelector("#book").addEventListener("touchstart",e=>startX=e.touches[0].clientX,{passive:true});document.querySelector("#book").addEventListener("touchend",e=>{const d=e.changedTouches[0].clientX-startX;if(Math.abs(d)>45)show(i+(d<0?1:-1))},{passive:true});p.forEach((page,x)=>page.classList.toggle("active",x===0));controls()})();</script></body></html>';
    $albumHtml = (string)ob_get_clean();
    $albumDirectory = __DIR__.'/albums';
    if (!is_dir($albumDirectory) && !mkdir($albumDirectory, 0755, true)) { http_response_code(500); exit('Photo album storage is not writable.'); }
    $savedAlbum = album_storage_path((int)$event['id']);
    if (file_put_contents($savedAlbum, $albumHtml, LOCK_EX) === false) { http_response_code(500); exit('The saved photo album could not be updated.'); }
    serve_saved_photo_album($event, $savedAlbum);
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
