<?php
declare(strict_types=1);
session_start();
require __DIR__ . '/lib.php';
ob_start(static function (string $html): string {
    $html = str_replace('<i></i>POVents', '<img src="assets/povents-logo.png?v=4" alt="POVents">', $html);
    $html = str_replace('<span class="brand"><img src="assets/povents-logo.png?v=4" alt="POVents"></span>', '<span class="brand"><img src="assets/povents-logo-dark.png?v=4" alt="POVents"></span>', $html);
    $html = str_replace('<footer class="shell section muted">POVents', '<footer class="shell section muted"><img class="footer-logo" src="assets/povents-logo.png?v=4" alt="POVents">', $html);
    $html = str_replace('<section class="card" style="text-align:center;color:#17231f"><div class="eyebrow">', '<section class="card" style="text-align:center;color:#17231f"><img class="message-logo" src="assets/povents-logo.png?v=4" alt="POVents"><div class="eyebrow">', $html);
    if (str_contains($html, 'action="?action=login"')) {
        $html = str_replace('<label for="email">Email address</label><input id="email" name="email" type="email"', '<label for="email">Email or admin username</label><input id="email" name="email" type="text"', $html);
    }
    if (str_contains($html, 'action="?action=register"')) {
        $html = str_replace('>Continue to plan</button>', '>Send verification code</button>', $html);
        $html = str_replace('<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password"></div><input type="hidden"', '<input id="password" name="password" type="password" required minlength="8" autocomplete="new-password"></div><div class="field"><label for="password_confirmation">Confirm password</label><input id="password_confirmation" name="password_confirmation" type="password" required minlength="8" autocomplete="new-password"></div><input type="hidden"', $html);
    }
    if (($currentUser = user()) && is_admin($currentUser)) {
        $html = preg_replace('~<span>Event passes</span><strong>.*?</strong>~', '<span>Admin access</span><strong>Unlimited</strong>', $html, 1) ?? $html;
    }
    $html = str_replace(['Your Creator plan activates automatically','Check my plan'], ['Your event pass is added automatically','Check my event passes'], $html);
    if (isset($_GET['id'])) {
        $albumNotice = '<strong>Save your photo album:</strong> The earliest photos expire $1 and will be permanently erased. Download the photo album at least once before this deadline so a saved album remains available after the original images are deleted. <a href="?action=download_photo_album&amp;event_id='.(int)$_GET['id'].'"><strong>Download photo album now</strong></a>';
        $html = preg_replace('~<strong>7-day storage:</strong> The earliest photos expire (.*?)\. Download originals before they are permanently erased\.~', $albumNotice, $html, 1) ?? $html;
    }
    $html = str_replace(['assets/app.js?v=4','assets/app.js?v=5','assets/app.js?v=6','assets/app.js?v=7'], 'assets/app.js?v=8', $html);
    if (str_contains($html, 'id="guest-link"') && isset($_GET['id'])) {
        $eventId = (int)$_GET['id'];
        $downloadButton = '<p class="event-downloads"><a class="button light" href="?action=download_event_qr&amp;event_id='.$eventId.'">Download branded QR image</a></p>';
        $html = preg_replace('~(<div class="copyline">.*?</div>)~s', '$1'.$downloadButton, $html, 1) ?? $html;
        if (is_file(album_storage_path($eventId)) && !str_contains($html, 'class="gallery"')) {
            $archivedAlbum = '<section class="card archived-album"><div><div class="eyebrow">Saved event album</div><h2>Photo album archive</h2><p class="muted">The original event photos have expired. Your last generated offline album remains available.</p></div><div class="actions"><a class="button" href="?action=download_photo_album&amp;event_id='.$eventId.'">Download photo album</a><button class="button light album-share" type="button" data-event-id="'.$eventId.'">Copy shareable album link</button></div></section>';
            $html = preg_replace('~<div class="empty">No photos yet\..*?</div>~s', $archivedAlbum, $html, 1) ?? $html;
        }
    }
    return str_replace(
        ['</head>','</body>'],
        ['<link rel="icon" href="assets/povents-logo.png?v=4"><link rel="stylesheet" href="assets/responsive.css?v=10"></head>','<script src="assets/gallery.js?v=6"></script></body>'],
        $html
    );
});

$page = $_GET['page'] ?? 'home';
$action = $_GET['action'] ?? '';

if ($action === 'download_event_qr') {
    $u = require_user();
    $event = event_for_owner((int)($_GET['event_id'] ?? 0), (int)$u['id']);
    if (!$event) { http_response_code(404); exit('Event not found.'); }
    download_event_qr($event, url('?page=capture&token='.$event['token']));
}
if ($action === 'download_photo_album') {
    $u = require_user();
    $event = event_for_owner((int)($_GET['event_id'] ?? 0), (int)$u['id']);
    if (!$event) { http_response_code(404); exit('Event not found.'); }
    download_photo_album($event);
}
if ($action === 'shared_album_link') {
    header('Content-Type: application/json');
    $u = require_user();
    $event = event_for_owner((int)($_GET['event_id'] ?? 0), (int)$u['id']);
    if (!$event) { http_response_code(404); echo json_encode(['error'=>'Event not found.']); exit; }
    echo json_encode(['url'=>shared_album_url($event)], JSON_UNESCAPED_SLASHES); exit;
}
if ($action === 'download_shared_album') {
    $eventId = (int)($_GET['event_id'] ?? 0); $expires = (int)($_GET['expires'] ?? 0); $signature = (string)($_GET['signature'] ?? '');
    $s = db()->prepare('SELECT * FROM events WHERE id=? AND is_active=1'); $s->execute([$eventId]); $event = $s->fetch();
    $savedAlbum = $event ? album_storage_path((int)$event['id']) : '';
    if (!$event || !hash_equals(shared_album_signature($event, $expires), $signature) || ($expires < time() && !is_file($savedAlbum))) { http_response_code(410); exit('This shared photo album link is invalid or has expired.'); }
    download_photo_album($event, true);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if ($action === 'upload') {
        header('Content-Type: application/json');
        try {
            check_csrf();
            $token = preg_replace('/[^a-f0-9]/', '', $_POST['token'] ?? '');
            $s = db()->prepare('SELECT * FROM events WHERE token=? AND is_active=1'); $s->execute([$token]);
            $event = $s->fetch();
            if (!$event) throw new RuntimeException('This event is no longer accepting photos.');
            if (event_day_status($event) !== 'open') throw new RuntimeException('This event camera is only available on the event date.');
            $sessionId = $_SESSION['capture'][$token] ?? null;
            if (!$sessionId) throw new RuntimeException('Capture session expired. Reload the page.');
            db()->beginTransaction();
            $s = db()->prepare('SELECT * FROM capture_sessions WHERE id=? AND event_id=? AND expires_at>NOW() FOR UPDATE');
            $s->execute([$sessionId, $event['id']]); $captureSession = $s->fetch();
            if (!$captureSession || (int)$captureSession['photo_count'] >= (int)cfg('max_photos_per_session')) throw new RuntimeException('You have reached the 5-photo limit for this scan.');
            if (!isset($_FILES['photo']) || $_FILES['photo']['error'] !== UPLOAD_ERR_OK) throw new RuntimeException('The photo could not be uploaded.');
            if ($_FILES['photo']['size'] > cfg('max_upload_bytes')) throw new RuntimeException('That photo exceeds the 1.5 MB limit.');
            $info = new finfo(FILEINFO_MIME_TYPE); $mime = $info->file($_FILES['photo']['tmp_name']);
            if (!in_array($mime, ['image/jpeg','image/png','image/webp'], true)) throw new RuntimeException('Only camera images are accepted.');
            $ext = ['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'][$mime];
            $dir = __DIR__ . '/uploads/' . $event['id'];
            if (!is_dir($dir) && !mkdir($dir, 0755, true)) throw new RuntimeException('Storage is not writable.');
            $name = date('Ymd-His') . '-' . bin2hex(random_bytes(8)) . '.' . $ext;
            if (!move_uploaded_file($_FILES['photo']['tmp_name'], $dir . '/' . $name)) throw new RuntimeException('Could not save the photo.');
            $expiresAt = $event['event_date']
                ? (new DateTimeImmutable($event['event_date'] . ' 23:59:59'))->modify('+' . (int)cfg('photo_retention_days') . ' days')->format('Y-m-d H:i:s')
                : (new DateTimeImmutable())->modify('+' . (int)cfg('photo_retention_days') . ' days')->format('Y-m-d H:i:s');
            $s = db()->prepare('INSERT INTO photos(event_id,capture_session_id,file_name,mime_type,file_size,expires_at) VALUES(?,?,?,?,?,?)');
            $s->execute([$event['id'],$sessionId,$name,$mime,$_FILES['photo']['size'],$expiresAt]);
            db()->prepare('UPDATE capture_sessions SET photo_count=photo_count+1 WHERE id=?')->execute([$sessionId]);
            $remaining = (int)cfg('max_photos_per_session') - ((int)$captureSession['photo_count'] + 1);
            db()->commit();
            echo json_encode(['ok'=>true,'remaining'=>$remaining,'url'=>'uploads/'.$event['id'].'/'.$name]); exit;
        } catch (Throwable $e) {
            if (db()->inTransaction()) db()->rollBack();
            http_response_code(400); echo json_encode(['error'=>$e->getMessage()]); exit;
        }
    }
    check_csrf();
    if ($action === 'download_zip') {
        $u=require_user(); $event=event_for_owner((int)($_POST['event_id']??0),(int)$u['id']);
        if (!$event) { http_response_code(404); exit('Event not found.'); }
        $requested=array_values(array_unique(array_filter(array_map('basename',$_POST['files']??[]))));
        if (!$requested) { flash('error','Select at least one photo to download.'); go('?page=event&id='.$event['id']); }
        if (!class_exists('ZipArchive')) { flash('error','ZIP downloads are not enabled on this server.'); go('?page=event&id='.$event['id']); }
        $placeholders=implode(',',array_fill(0,count($requested),'?'));
        $s=db()->prepare("SELECT file_name FROM photos WHERE event_id=? AND expires_at>NOW() AND file_name IN ($placeholders)");
        $s->execute(array_merge([$event['id']],$requested)); $files=$s->fetchAll(PDO::FETCH_COLUMN);
        if (!$files) { flash('error','The selected photos are no longer available.'); go('?page=event&id='.$event['id']); }
        $zipPath=tempnam(sys_get_temp_dir(),'povents-'); $zip=new ZipArchive();
        if ($zip->open($zipPath,ZipArchive::CREATE|ZipArchive::OVERWRITE)!==true) { @unlink($zipPath); http_response_code(500); exit('Could not create ZIP file.'); }
        foreach($files as $file){$path=__DIR__.'/uploads/'.$event['id'].'/'.basename($file);if(is_file($path))$zip->addFile($path,basename($file));}
        $zip->close(); $downloadName=preg_replace('/[^A-Za-z0-9_-]+/','-',trim($event['title'])).'-photos.zip';
        if (ob_get_level()) ob_end_clean();
        header('Content-Type: application/zip'); header('Content-Disposition: attachment; filename="'.$downloadName.'"'); header('Content-Length: '.filesize($zipPath)); header('Cache-Control: no-store');
        readfile($zipPath); @unlink($zipPath); exit;
    }
    if ($action === 'register') {
        $name = trim($_POST['name'] ?? ''); $email = strtolower(trim($_POST['email'] ?? '')); $password = $_POST['password'] ?? ''; $passwordConfirmation = $_POST['password_confirmation'] ?? '';
        if (strlen($name) < 2 || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 8) { flash('error','Use a valid name, email, and a password of at least 8 characters.'); go('?page=register'); }
        if (!hash_equals($password, $passwordConfirmation)) { flash('error','The passwords do not match. Please try again.'); go('?page=register'); }
        $s=db()->prepare('SELECT id FROM users WHERE email=?'); $s->execute([$email]);
        if ($s->fetchColumn()) { flash('error','That email is already registered.'); go('?page=register'); }
        $otp=(string)random_int(100000,999999);
        try { send_registration_otp($name,$email,$otp); }
        catch(Throwable $e) { unset($_SESSION['pending_registration']); flash('error',$e->getMessage()); go('?page=register'); }
        $_SESSION['pending_registration']=['name'=>$name,'email'=>$email,'password_hash'=>password_hash($password,PASSWORD_DEFAULT),'otp_hash'=>password_hash($otp,PASSWORD_DEFAULT),'expires_at'=>time()+600,'attempts'=>0,'last_sent_at'=>time()];
        go('?page=verify-registration');
    }
    if ($action === 'verify_registration') {
        $pending=$_SESSION['pending_registration']??null; $otp=preg_replace('/\D/','',$_POST['otp']??'');
        if (!$pending || (int)$pending['expires_at']<time()) { unset($_SESSION['pending_registration']); flash('error','Your verification code expired. Please register again.'); go('?page=register'); }
        $pending['attempts']=(int)$pending['attempts']+1; $_SESSION['pending_registration']=$pending;
        if ($pending['attempts']>5) { unset($_SESSION['pending_registration']); flash('error','Too many incorrect attempts. Please register again.'); go('?page=register'); }
        if (strlen($otp)!==6 || !password_verify($otp,$pending['otp_hash'])) { flash('error','That verification code is incorrect.'); go('?page=verify-registration'); }
        try {
            $s=db()->prepare('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)'); $s->execute([$pending['name'],$pending['email'],$pending['password_hash']]);
            $userId=(int)db()->lastInsertId(); unset($_SESSION['pending_registration']); session_regenerate_id(true); refresh_user($userId); go('?page=dashboard');
        } catch(PDOException $e) { unset($_SESSION['pending_registration']); flash('error','That email is already registered.'); go('?page=login'); }
    }
    if ($action === 'resend_registration_otp') {
        $pending=$_SESSION['pending_registration']??null;
        if (!$pending || (int)$pending['expires_at']<time()) { unset($_SESSION['pending_registration']); flash('error','Your registration session expired. Please start again.'); go('?page=register'); }
        if (time()-(int)$pending['last_sent_at']<60) { flash('error','Please wait one minute before requesting another code.'); go('?page=verify-registration'); }
        $otp=(string)random_int(100000,999999);
        try { send_registration_otp($pending['name'],$pending['email'],$otp); }
        catch(Throwable $e) { flash('error',$e->getMessage()); go('?page=verify-registration'); }
        $pending['otp_hash']=password_hash($otp,PASSWORD_DEFAULT); $pending['expires_at']=time()+600; $pending['attempts']=0; $pending['last_sent_at']=time(); $_SESSION['pending_registration']=$pending;
        flash('success','A new verification code was sent.'); go('?page=verify-registration');
    }
    if ($action === 'login') {
        $identifier=strtolower(trim($_POST['email'] ?? ''));
        if ($identifier === 'admin') { $s=db()->query('SELECT * FROM users WHERE is_admin=1 ORDER BY id ASC LIMIT 1'); $u=$s->fetch(); }
        else { $s=db()->prepare('SELECT * FROM users WHERE email=?'); $s->execute([$identifier]); $u=$s->fetch(); }
        if (!$u || !password_verify($_POST['password'] ?? '', $u['password_hash'])) { flash('error','Email or password is incorrect.'); go('?page=login'); }
        refresh_user((int)$u['id']); go('?page=dashboard');
    }
    if ($action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $cookie = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'=>time()-42000,'path'=>$cookie['path'],'domain'=>$cookie['domain'],
                'secure'=>$cookie['secure'],'httponly'=>$cookie['httponly'],'samesite'=>'Lax',
            ]);
        }
        session_destroy();
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        go('?');
    }
    if ($action === 'subscribe') {
        $u=require_user();
        if (is_admin($u)) go('?page=dashboard');
        if (local_payment_bypass()) {
            db()->prepare("UPDATE users SET subscription_status='active',event_credits=event_credits+1,subscription_ends_at=NULL WHERE id=?")->execute([$u['id']]);
            refresh_user((int)$u['id']);
            flash('success','Local test plan activated. No payment was charged.');
            go('?page=dashboard');
        }
        try {
            $reference='povents-user-'.$u['id'].'-'.bin2hex(random_bytes(5));
            $result=paymongo('POST','checkout_sessions',['data'=>['attributes'=>[
                'billing'=>['name'=>$u['name'],'email'=>$u['email']],
                'line_items'=>[['currency'=>'PHP','amount'=>(int)cfg('plan_price_centavos'),'name'=>'POVents One Event Pass','quantity'=>1]],
                'payment_method_types'=>['qrph'],
                'description'=>'Create events and collect every guest perspective.',
                'reference_number'=>$reference,
                'success_url'=>url('?page=payment-return'),
                'cancel_url'=>url('?page=subscribe'),
                'send_email_receipt'=>true,
                'show_description'=>true,
                'show_line_items'=>true,
            ]]]);
            $checkout=$result['data']; db()->prepare('INSERT INTO payments(user_id,checkout_id,amount) VALUES(?,?,?)')->execute([$u['id'],$checkout['id'],cfg('plan_price_centavos')]);
            go($checkout['attributes']['checkout_url']);
        } catch(Throwable $e) { flash('error','Payment checkout is temporarily unavailable. Check your PayMongo configuration.'); go('?page=subscribe'); }
    }
    if ($action === 'create_event') {
        $u=require_user(); if (!active_subscription($u)) go('?page=subscribe');
        $title=trim($_POST['title'] ?? ''); if (strlen($title)<3) { flash('error','Give your event a name.'); go('?page=new-event'); }
        $eventDate=$_POST['event_date'] ?? '';
        $parsedDate=DateTimeImmutable::createFromFormat('!Y-m-d',$eventDate);
        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $eventDate) { flash('error','Choose a valid event date.'); go('?page=new-event'); }
        $startTime=$_POST['start_time'] ?? ''; $endTime=$_POST['end_time'] ?? '';
        $startParsed=DateTimeImmutable::createFromFormat('!H:i',$startTime); $endParsed=DateTimeImmutable::createFromFormat('!H:i',$endTime);
        if (!$startParsed || !$endParsed || $startParsed->format('H:i')!==$startTime || $endParsed->format('H:i')!==$endTime || $endTime<=$startTime) { flash('error','Choose valid event times. The end time must be later than the start time.'); go('?page=new-event'); }
        db()->beginTransaction();
        if (!is_admin($u)) {
            $credit=db()->prepare("SELECT event_credits FROM users WHERE id=? AND event_credits>0 FOR UPDATE");
            $credit->execute([$u['id']]);
            if ($credit->fetchColumn() === false) { db()->rollBack(); go('?page=subscribe'); }
        }
        $s=db()->prepare('INSERT INTO events(user_id,title,event_date,start_time,end_time,location,token) VALUES(?,?,?,?,?,?,?)');
        $s->execute([$u['id'],$title,$eventDate,$startTime.':00',$endTime.':00',trim($_POST['location'] ?? ''),bin2hex(random_bytes(16))]);
        $eventId=(int)db()->lastInsertId();
        if (!is_admin($u)) db()->prepare("UPDATE users SET subscription_status=IF(event_credits=1,'inactive','active'),event_credits=event_credits-1 WHERE id=?")->execute([$u['id']]);
        db()->commit(); refresh_user((int)$u['id']);
        go('?page=event&id='.$eventId);
    }
    if ($action === 'update_event') {
        $u=require_user(); $event=event_for_owner((int)($_POST['event_id']??0),(int)$u['id']);
        if (!$event) { http_response_code(404); exit('Event not found.'); }
        if (event_day_status($event) !== 'upcoming') { flash('error','Event details can no longer be edited because the event has started.'); go('?page=event&id='.$event['id']); }
        $title=trim($_POST['title']??''); $eventDate=$_POST['event_date']??''; $startTime=$_POST['start_time']??''; $endTime=$_POST['end_time']??'';
        $parsedDate=DateTimeImmutable::createFromFormat('!Y-m-d',$eventDate); $startParsed=DateTimeImmutable::createFromFormat('!H:i',$startTime); $endParsed=DateTimeImmutable::createFromFormat('!H:i',$endTime);
        if (strlen($title)<3 || !$parsedDate || $parsedDate->format('Y-m-d')!==$eventDate || !$startParsed || !$endParsed || $startParsed->format('H:i')!==$startTime || $endParsed->format('H:i')!==$endTime || $endTime<=$startTime) { flash('error','Enter valid event details and make sure the end time is later than the start time.'); go('?page=edit-event&id='.$event['id']); }
        $newStart=new DateTimeImmutable($eventDate.' '.$startTime.':00');
        if ($newStart<=new DateTimeImmutable('now')) { flash('error','The updated event start must still be in the future.'); go('?page=edit-event&id='.$event['id']); }
        db()->prepare('UPDATE events SET title=?,event_date=?,start_time=?,end_time=?,location=? WHERE id=? AND user_id=?')->execute([$title,$eventDate,$startTime.':00',$endTime.':00',trim($_POST['location']??''),$event['id'],$u['id']]);
        flash('success','Event details updated.'); go('?page=event&id='.$event['id']);
    }
}

if ($page === 'capture') {
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    $token=preg_replace('/[^a-f0-9]/','',$_GET['token'] ?? ''); $s=db()->prepare('SELECT * FROM events WHERE token=? AND is_active=1'); $s->execute([$token]); $event=$s->fetch();
    if (!$event) { http_response_code(404); exit('This photo event is unavailable.'); }
    $dayStatus=event_day_status($event);
    if ($dayStatus !== 'open') {
        $message=$dayStatus==='upcoming'
            ? 'The camera opens on '.date('F j, Y',strtotime($event['event_date'])).' at '.date('g:i A',strtotime($event['start_time'])).'. Come back then.'
            : 'This event is already done. Photo uploads are now closed.';
        ?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title><?=e($event['title'])?> · POVents</title><link rel="stylesheet" href="assets/style.css"></head><body class="camera-page"><main class="camera-shell" style="min-height:100vh;display:grid;place-items:center"><section class="card" style="text-align:center;color:#17231f"><div class="eyebrow"><?=e($event['title'])?></div><h1 style="font-size:48px;letter-spacing:-2px"><?=$dayStatus==='upcoming'?'Not yet!':'That’s a wrap.'?></h1><p class="lead"><?=e($message)?></p></section></main></body></html><?php exit;
    }
    $sid=$_SESSION['capture'][$token] ?? null; $count=0; $validSession=false;
    if ($sid) {
        $s=db()->prepare('SELECT photo_count FROM capture_sessions WHERE id=? AND event_id=? AND expires_at>NOW()');
        $s->execute([$sid,$event['id']]);
        $storedCount=$s->fetchColumn();
        if ($storedCount !== false) { $count=(int)$storedCount; $validSession=true; }
    }
    if (!$validSession) {
        $sid=bin2hex(random_bytes(16));
        db()->prepare('INSERT INTO capture_sessions(id,event_id,expires_at) VALUES(?,?,DATE_ADD(NOW(),INTERVAL 2 HOUR))')->execute([$sid,$event['id']]);
        $_SESSION['capture'][$token]=$sid; $count=0;
    }
    ?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="csrf-token" content="<?=csrf()?>"><title><?=e($event['title'])?> · POVents</title><link rel="stylesheet" href="assets/style.css?v=4"></head><body class="camera-page"><main class="camera-shell"><div class="camera-top"><span class="brand"><i></i>POVents</span><span><?=e($event['title'])?></span></div><section class="camera" data-camera data-token="<?=e($token)?>" data-remaining="<?=cfg('max_photos_per_session')-$count?>"><video autoplay playsinline muted></video><canvas></canvas><input type="file" data-file-camera accept="image/*" capture="environment" hidden><div class="camera-controls"><button class="switch" data-switch aria-label="Switch camera">↻</button><button class="shutter" data-capture aria-label="Take a photo"></button></div></section><p class="capture-status" data-status>Preparing camera…</p><div class="strip" data-strip></div><p class="muted" style="text-align:center">Capture up to five candid moments from your point of view.</p></main><script src="assets/app.js?v=4"></script></body></html><?php exit;
}

function header_html(string $title='POVents'): void { $u=user(); $f=pull_flash(); ?><!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="csrf-token" content="<?=csrf()?>"><title><?=e($title)?> · POVents</title><meta name="description" content="Collect every guest's point of view through one event QR code."><link rel="stylesheet" href="assets/style.css"></head><body><header class="shell nav"><a class="brand" href="?"><i></i>POVents</a><nav class="navlinks"><?php if($u): ?><a href="?page=dashboard">My events</a><form method="post" action="?action=logout"><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="button light">Log out</button></form><?php else: ?><a href="?page=login">Log in</a><a class="button" href="?page=register">Start creating</a><?php endif; ?></nav></header><?php if($f): ?><div class="shell alert <?=e($f['type'])?>"><?=e($f['message'])?></div><?php endif; }
function footer_html(): void { ?><footer class="shell section muted">POVents — every angle tells the story.</footer></body></html><?php }

if ($page === 'verify-registration') {
    $pending=$_SESSION['pending_registration']??null;
    if (!$pending || (int)($pending['expires_at']??0)<time()) { unset($_SESSION['pending_registration']); flash('error','Your registration session expired. Please start again.'); go('?page=register'); }
    header_html('Verify your email'); ?>
    <main class="shell auth-wrap"><section class="card auth"><div class="eyebrow">Check your inbox</div><h1>Verify your email</h1><p class="lead">We sent a six-digit code to <strong><?=e($pending['email'])?></strong>. It expires in 10 minutes.</p><form method="post" action="?action=verify_registration"><div class="field"><label for="otp">Verification code</label><input id="otp" name="otp" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required style="font-size:28px;letter-spacing:8px;text-align:center"></div><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="full" type="submit">Verify and create account</button></form><form method="post" action="?action=resend_registration_otp" style="margin-top:10px"><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="button light full" type="submit">Resend code</button></form><p class="muted" style="font-size:13px">Didn't request this account? You can safely close this page.</p></section></main>
    <?php footer_html(); exit;
}

purge_expired_photos();
header_html(ucfirst(str_replace('-',' ',$page)));
if ($page === 'home'): ?>
<main><section class="shell hero"><div><div class="eyebrow">The crowd is your camera crew</div><h1>Every angle.<br>One story.</h1><p class="lead">Create an event, share one QR code, and let every guest capture the moments only they can see. All photos land in your private gallery automatically.</p><div style="display:flex;gap:10px;margin-top:30px"><a class="button" href="?page=register">Create your event</a><a class="button light" href="#how">See how it works</a></div></div><div class="hero-card"><div class="photo-stack"></div><div class="mini-stat"><div><strong>5</strong><br><span>shots per scan</span></div><div><strong>∞</strong><br><span>guest perspectives</span></div></div></div></section><section class="section" id="how" style="background:#e7e8dc"><div class="shell"><div class="section-head"><div><div class="eyebrow">Simple by design</div><h2>Scan. Shoot. Remember.</h2></div><p class="lead">No app download and no guest account.</p></div><div class="grid-3"><article class="feature"><div class="number">1</div><h3>Create your event</h3><p>Subscribe, add your event details, and receive a unique QR code.</p></article><article class="feature"><div class="number">2</div><h3>Guests scan & snap</h3><p>The QR opens a secure camera page. Each scan captures up to five photos.</p></article><article class="feature"><div class="number">3</div><h3>Watch it unfold</h3><p>Every photo appears in your organizer gallery, ready to revisit.</p></article></div></div></section></main>
<?php elseif ($page === 'register' || $page === 'login'): $register=$page==='register'; ?>
<main class="shell auth-wrap"><section class="card auth"><div class="eyebrow"><?=$register?'Your story starts here':'Welcome back'?></div><h1><?=$register?'Create account':'Log in'?></h1><form method="post" action="?action=<?=$page?>"><?php if($register): ?><div class="field"><label for="name">Your name</label><input id="name" name="name" required autocomplete="name"></div><?php endif; ?><div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" required autocomplete="email"></div><div class="field"><label for="password">Password</label><input id="password" name="password" type="password" required minlength="8" autocomplete="<?=$register?'new-password':'current-password'?>"></div><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="full" type="submit"><?=$register?'Continue to plan':'Log in'?></button></form><p class="muted"><?=$register?'Already have an account? <a href="?page=login">Log in</a>':'New here? <a href="?page=register">Create an account</a>'?></p></section></main>
<?php elseif ($page === 'subscribe'): $u=require_user(); ?>
<main class="shell auth-wrap"><section class="card auth"><div class="eyebrow">One-event pass</div><h1>One event. Every perspective.</h1><p class="lead">Create one event and collect its guest photos in a private gallery.</p><div style="font-size:46px;font-weight:850;margin:22px 0">₱<?=number_format(cfg('plan_price_centavos')/100)?> <small class="muted" style="font-size:16px">/ event</small></div><form method="post" action="?action=subscribe"><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="full"><?=local_payment_bypass()?'Add local event pass':'Buy event pass with QRPh'?></button></form><?php if(local_payment_bypass()): ?><p class="alert" style="font-size:13px"><strong>Local testing:</strong> Payment is bypassed and no charge will be made.</p><?php else: ?><p class="muted" style="font-size:13px">Each confirmed payment adds one event pass. Scan using a supported Philippine banking or e-wallet app.</p><?php endif; ?></section></main>
<?php elseif ($page === 'payment-return'): $u=require_user(); refresh_user((int)$u['id']); ?>
<main class="shell auth-wrap"><section class="card auth"><div class="eyebrow">Payment received</div><h1>We’re confirming it.</h1><p class="lead">PayMongo will confirm your payment securely. Your Creator plan activates automatically, usually within a few seconds.</p><a class="button full" href="?page=dashboard">Check my plan</a></section></main>
<?php elseif ($page === 'dashboard'): $u=require_user(); $s=db()->prepare('SELECT e.*,COUNT(p.id) photos FROM events e LEFT JOIN photos p ON p.event_id=e.id WHERE e.user_id=? GROUP BY e.id ORDER BY e.created_at DESC');$s->execute([$u['id']]);$events=$s->fetchAll();$photos=array_sum(array_column($events,'photos')); ?>
<main class="shell"><div class="dash-head"><div><div class="eyebrow">Organizer studio</div><h1>Hello, <?=e(explode(' ',$u['name'])[0])?>.</h1></div><a class="button" href="<?=active_subscription($u)?'?page=new-event':'?page=subscribe'?>"><?=active_subscription($u)?'+ New event':'Buy event pass'?></a></div><section class="stats"><div class="stat"><span>Events</span><strong><?=count($events)?></strong></div><div class="stat"><span>Photos collected</span><strong><?=$photos?></strong></div><div class="stat"><span>Event passes</span><strong><?=(int)($u['event_credits']??0)?></strong></div></section><?php if(!$events): ?><div class="empty"><h3>Your first story starts here.</h3><p>Use one event pass to create an event and receive its guest QR code.</p><a class="button" href="<?=active_subscription($u)?'?page=new-event':'?page=subscribe'?>"><?=active_subscription($u)?'Create event':'Buy event pass'?></a></div><?php else: ?><div class="event-list"><?php foreach($events as $event): ?><a class="event-row" href="?page=event&id=<?=$event['id']?>"><div><h3><?=e($event['title'])?></h3><span class="muted"><?=e($event['event_date'] ?: 'Date not set')?> · <?=e($event['location'] ?: 'Location not set')?></span></div><strong><?=$event['photos']?> photos →</strong></a><?php endforeach; ?></div><?php endif; ?></main>
<?php elseif ($page === 'new-event'): $u=require_user(); if(!active_subscription($u)) go('?page=subscribe'); ?>
<main class="shell auth-wrap"><section class="card auth"><div class="eyebrow">New collection</div><h1>Create event</h1><form method="post" action="?action=create_event"><div class="field"><label for="title">Event name</label><input id="title" name="title" placeholder="Maya & Luis' wedding" required></div><div class="field"><label for="date">Event date</label><input id="date" name="event_date" type="date" required></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field"><label for="start">Camera start</label><input id="start" name="start_time" type="time" required></div><div class="field"><label for="end">Camera end</label><input id="end" name="end_time" type="time" required></div></div><div class="field"><label for="location">Location</label><input id="location" name="location" placeholder="The Glass Garden"></div><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="full">Create event & QR</button></form><p class="muted" style="font-size:13px">The guest camera works only during this time window. Photos are permanently deleted seven days after the event.</p></section></main>
<?php elseif ($page === 'edit-event'): $u=require_user(); $event=event_for_owner((int)($_GET['id']??0),(int)$u['id']); if(!$event){http_response_code(404);echo '<main class="shell empty">Event not found.</main>';}elseif(event_day_status($event)!=='upcoming'){flash('error','This event can no longer be edited because it has started.');go('?page=event&id='.$event['id']);}else{ ?>
<main class="shell auth-wrap"><section class="card auth"><div class="eyebrow">Before the event</div><h1>Edit event</h1><form method="post" action="?action=update_event"><div class="field"><label for="title">Event name</label><input id="title" name="title" value="<?=e($event['title'])?>" required></div><div class="field"><label for="date">Event date</label><input id="date" name="event_date" type="date" value="<?=e($event['event_date'])?>" required></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div class="field"><label for="start">Camera start</label><input id="start" name="start_time" type="time" value="<?=e(substr($event['start_time'],0,5))?>" required></div><div class="field"><label for="end">Camera end</label><input id="end" name="end_time" type="time" value="<?=e(substr($event['end_time'],0,5))?>" required></div></div><div class="field"><label for="location">Location</label><input id="location" name="location" value="<?=e($event['location'])?>"></div><input type="hidden" name="event_id" value="<?=$event['id']?>"><input type="hidden" name="csrf" value="<?=csrf()?>"><button class="full">Save changes</button></form><p class="muted" style="font-size:13px">Editing locks automatically when the event starts.</p></section></main>
<?php } ?>
<?php elseif ($page === 'event'): $u=require_user();$event=event_for_owner((int)($_GET['id']??0),(int)$u['id']);if(!$event){http_response_code(404);echo '<main class="shell empty">Event not found.</main>';}else{$s=db()->prepare('SELECT * FROM photos WHERE event_id=? AND expires_at>NOW() ORDER BY created_at DESC');$s->execute([$event['id']]);$photos=$s->fetchAll();$guest=url('?page=capture&token='.$event['token']);$qr='https://api.qrserver.com/v1/create-qr-code/?size=520x520&data='.rawurlencode($guest);$soonest=$photos?min(array_map(fn($p)=>strtotime($p['expires_at']),$photos)):null; ?>
<main class="shell"><div class="dash-head"><div><a class="muted" href="?page=dashboard">← All events</a><h1><?=e($event['title'])?></h1><p class="muted"><?=e($event['event_date']?:'Date not set')?> · <?=e($event['location']?:'Location not set')?></p></div><strong><?=count($photos)?> photos</strong></div><section class="card qr-panel"><img src="<?=e($qr)?>" alt="Guest camera QR code"><div><div class="eyebrow">Guest camera link</div><h2>Print it. Place it. Let guests shoot.</h2><p class="muted">Each new scan opens the camera and allows up to five photo uploads.</p><div class="copyline"><input id="guest-link" readonly value="<?=e($guest)?>"><button type="button" onclick="navigator.clipboard.writeText(document.getElementById('guest-link').value);this.textContent='Copied!'">Copy</button></div><p><a href="<?=e($guest)?>" target="_blank">Preview guest camera →</a></p></div></section><?php if($soonest): ?><div class="alert" style="margin-top:18px"><strong>7-day storage:</strong> The earliest photos expire <?=date('M j, Y \a\t g:i A',$soonest)?>. Download originals before they are permanently erased.</div><?php endif; ?><section class="section"><div class="section-head"><div><div class="eyebrow">Live gallery</div><h2>Every point of view</h2></div><button class="button light" onclick="location.reload()">Refresh photos</button></div><?php if(!$photos): ?><div class="empty">No photos yet. Share the QR code and watch this gallery come alive.</div><?php else: ?><div class="gallery"><?php foreach($photos as $photo): ?><figure class="shot"><a href="uploads/<?=$event['id']?>/<?=e($photo['file_name'])?>" download><img loading="lazy" src="uploads/<?=$event['id']?>/<?=e($photo['file_name'])?>" alt="Guest photo"></a><time><?=max(1,(int)ceil((strtotime($photo['expires_at'])-time())/86400))?>d left</time></figure><?php endforeach; ?></div><?php endif; ?></section></main>
<?php if(event_day_status($event)==='upcoming'): ?><a class="button" style="position:fixed;right:24px;bottom:24px;z-index:5" href="?page=edit-event&id=<?=$event['id']?>">Edit event</a><?php endif; ?>
<?php } else: http_response_code(404); ?><main class="shell empty">Page not found.</main><?php endif; footer_html();
