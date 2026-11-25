# BartaCare Admin

স্বতন্ত্র Next.js app। Vercel project-এর Root Directory হিসেবে `admin-app` দিন।
Customer app-এর project আলাদা থাকবে। একই Supabase project-এর URL এবং publishable key ব্যবহার করুন।

## Windows PowerShell

Repository root থেকে চালান।

```powershell
cd admin-app
npm ci
Copy-Item .env.example .env.local
notepad .env.local
npm run typecheck
npm run build
npm run dev -- --port 3100
```

Browser-এ http://localhost:3100 খুলুন। ZIP থেকে চালালে প্রথমে সেটি extract করুন।

## Database ও staff access

BartaCare core schema এবং support_channel_connections table থাকতে হবে।
আলাদা অনুমোদন নিয়ে শুধু `supabase/migrations/202611250002_platform_directory.sql` প্রয়োগ করুন।
এই সংস্করণ production main থেকে তৈরি। আগের পরীক্ষামূলক /platform-admin migration এর সঙ্গে একসাথে চালাবেন না।

প্রথম staff-এর বিদ্যমান Supabase Auth account-এর UUID যাচাই করে অনুমোদিত database operator
`supportflow_private.platform_admins(user_id)`-এ যোগ করবেন। Access প্রত্যাহারে ঐ membership সরাতে হবে।
প্রতিটি directory ও detail request-এ database membership পুনরায় যাচাই হয়।
Member email ও channel configuration শুধু staff দেখতে পান। Channel status সংযোগের enabled setting দেখায়।

## যাচাই

আলাদা test database-এ migration-এর পর `tests/platform-directory.sql` চালান। এটি fixture তৈরি করে rollback করে।
Browser-এ staff login, business search, pagination, member ও channel detail এবং logout যাচাই করুন।
একটি সাধারণ business owner account দিয়েও access denied যাচাই করুন।
