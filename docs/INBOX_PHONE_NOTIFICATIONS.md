# Inbox phone notifications

Each browser, signed-in staff member and workspace has a separate opt-in. Settings → নোটিফিকেশন starts with **না** selected. **হ্যাঁ** requests browser permission. An inbound message queues a generic notification for subscribed devices of the assigned member, or subscribed owners and admins when unassigned. Tapping the notification opens that workspace's Inbox. Removing a member or deleting a subscription removes their queued deliveries. Outbound replies do not enqueue notifications.

## Configuration

Use HTTPS in Preview and Production. Use separate VAPID key pairs per environment. Generate one pair locally with PowerShell in a private terminal, then store it in the appropriate environment's secret manager. Keep the same pair across redeployments. The public key must be present at build time.

```powershell
$pushKeys = node -e "const c=require('node:crypto').createECDH('prime256v1');c.generateKeys();console.log(JSON.stringify({public:c.getPublicKey().toString('base64url'),private:c.getPrivateKey().toString('base64url')}))" | ConvertFrom-Json
$env:NEXT_PUBLIC_INBOX_VAPID_KEY = $pushKeys.public
$env:INBOX_VAPID_PRIVATE_KEY = $pushKeys.private
$env:INBOX_VAPID_SUBJECT = 'mailto:replace-with-your-monitored-address@example.com'
npm run typecheck
npm run build
```

After database approval, apply the migration ending in **inbox_phone_push.sql** to the chosen Supabase project. It requires the existing Inbox tables, membership composite key, and conversation assignment column. Configure the deployment's existing server-only Supabase credentials and CRON_SECRET. After the matching HTTPS deployment is ready, set the Vault entry **bartacare_push_worker_url** to that deployment's /api/internal/deliver-inbox-push URL. The existing **supportflow_worker_cron_secret** Vault entry must match CRON_SECRET. Verify pg_cron and pg_net are active and apply **database/inbox_push_scheduler.sql** to schedule delivery every ten seconds. Use only a trusted stable deployment URL for this secret-bearing request.

## Phone acceptance check

1. Open Settings → নোটিফিকেশন in a supported browser. On iPhone, install BartaCare on the Home Screen and launch it there.
2. With **না** selected, send an inbound customer message. Confirm it appears in the Inbox without a phone alert.
3. Select **হ্যাঁ**, grant permission and close the app. Send another customer message. Check the notification text and tap it to open the Inbox.
4. Repeat with an assigned member, an unassigned conversation, and a member of another business. Check an outbound reply produces no alert.
5. Select **না**, reload, close the app and send another customer message. Confirm the setting persists and delivery stops. Also exercise denied browser permission and sign-out on a shared phone.
