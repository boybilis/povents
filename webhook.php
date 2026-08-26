<?php
declare(strict_types=1);
require __DIR__ . '/lib.php';
$raw = file_get_contents('php://input');
$payload = json_decode($raw,true);
$signature = $_SERVER['HTTP_PAYMONGO_SIGNATURE'] ?? '';
$parts = [];
foreach (explode(',', $signature) as $part) { [$k,$v] = array_pad(explode('=',trim($part),2),2,''); $parts[$k]=$v; }
$timestamp = $parts['t'] ?? '';
$expected = hash_hmac('sha256', $timestamp . '.' . $raw, (string)cfg('paymongo_webhook_secret'));
$liveMode = (bool)($payload['data']['attributes']['livemode'] ?? false);
$provided = $liveMode ? ($parts['li'] ?? '') : ($parts['te'] ?? '');
if (!$timestamp || abs(time()-(int)$timestamp)>300 || !$provided || !hash_equals($expected,$provided)) { http_response_code(401); exit('Invalid signature'); }
$type = $payload['data']['attributes']['type'] ?? '';
if ($type === 'checkout_session.payment.paid') {
    $checkout = $payload['data']['attributes']['data']['id'] ?? '';
    db()->beginTransaction();
    $s=db()->prepare("SELECT * FROM payments WHERE checkout_id=? AND status='pending' FOR UPDATE");$s->execute([$checkout]);$payment=$s->fetch();
    if ($payment) {
        db()->prepare("UPDATE payments SET status='paid',paid_at=NOW() WHERE id=?")->execute([$payment['id']]);
        db()->prepare("UPDATE users SET subscription_status='active',event_credits=event_credits+1,subscription_ends_at=DATE_ADD(GREATEST(COALESCE(subscription_ends_at,NOW()),NOW()),INTERVAL ? DAY) WHERE id=?")->execute([(int)cfg('plan_days'),$payment['user_id']]);
    }
    db()->commit();
}
http_response_code(200); echo 'ok';
