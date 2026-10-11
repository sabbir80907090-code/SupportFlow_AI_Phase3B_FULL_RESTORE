# Run from the project folder: .\scripts\register-telegram-webhook.ps1
# Requires a public HTTPS tunnel to your running Next.js app.
$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) '.env.local'
if (!(Test-Path $envFile)) { throw '.env.local not found in project folder.' }
$settings = @{}
Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if ($line -and !$line.StartsWith('#') -and $line.Contains('=')) {
    $parts = $line.Split('=', 2)
    $settings[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
  }
}
$token = $settings['TELEGRAM_BOT_TOKEN']
$secret = $settings['TELEGRAM_WEBHOOK_SECRET']
if (!$token -or !$secret -or $secret.Length -lt 16) { throw 'Missing Telegram token or webhook secret in .env.local.' }
$base = Read-Host 'Enter your public HTTPS tunnel URL (example: https://example.ngrok-free.app)'
if ($base -notmatch '^https://[^/]+/?$') { throw 'Expected a public HTTPS URL without a path.' }
$webhook = $base.TrimEnd('/') + '/api/telegram/webhook'
$body = @{url=$webhook; secret_token=$secret; allowed_updates='["message"]'; drop_pending_updates='false'}
$result = Invoke-RestMethod -Method Post -Uri ("https://api.telegram.org/bot" + $token + "/setWebhook") -Body $body
if ($result.ok) { Write-Host "Webhook registered successfully: $webhook" -ForegroundColor Green }
else { Write-Host 'Telegram rejected webhook setup.' -ForegroundColor Red }
