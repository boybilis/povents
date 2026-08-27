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
        $plan=pricing_plan((int)($payment['pricing_plan_id']??0));
        if(!$plan){$plan=db()->query('SELECT * FROM pricing_plans WHERE is_active=1 ORDER BY is_featured DESC,display_order,id LIMIT 1')->fetch();}
        if(!$plan) throw new RuntimeException('No pricing plan is available for this payment.');
        db()->prepare("UPDATE payments SET status='paid',paid_at=NOW() WHERE id=?")->execute([$payment['id']]);
        db()->prepare('INSERT INTO user_plan_credits(user_id,pricing_plan_id,credits) VALUES(?,?,?) ON DUPLICATE KEY UPDATE credits=credits+VALUES(credits)')->execute([$payment['user_id'],$plan['id'],$plan['passes_per_purchase']]);
        db()->prepare("UPDATE users SET subscription_status='active',event_credits=event_credits+?,subscription_ends_at=NULL WHERE id=?")->execute([$plan['passes_per_purchase'],$payment['user_id']]);
    }
    db()->commit();
}
http_response_code(200); echo 'ok';
