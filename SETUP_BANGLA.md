# SupportFlow AI Phase 3B — বাংলা সেটআপ

আপনার পুরোনো Telegram Inbox এবং Order Dashboard ঠিক রেখেই Gemini AI Auto Reply যোগ করা হয়েছে।

## প্রথমে

1. পুরোনো প্রজেক্টের **ব্যাকআপ** রাখুন। `.env.local` ফাইলটি কাউকে পাঠাবেন না।
2. পুরোনো `npm run dev` বন্ধ করুন (`Ctrl+C`)।
3. ZIP Extract করে `supportflow-ai-phase3a` ফোল্ডার VS Code-এ খুলুন।
4. Supabase → **SQL Editor** → `SupportFlow_AI_Phase3B_Gemini.sql`-এর সব কোড Paste করে **Run** করুন। পুরোনো Phase 3A SQL আবার চালানোর প্রয়োজন নেই।
5. আপনার পুরোনো `.env.local` ফাইলটি নতুন প্রজেক্টের `package.json`-এর পাশে রাখুন। নিচের দুটি লাইন যুক্ত করুন:

```dotenv
GEMINI_API_KEY=আপনার_নিজস্ব_গোপন_API_KEY
GEMINI_MODEL=gemini-2.5-flash
```

**API Key এখানে ChatGPT-তে পাঠাবেন না।**

6. VS Code Terminal-এ `package.json`-এর ফোল্ডার থেকে চালান:

```powershell
npm install
npm run dev
```

7. Browser-এ `http://localhost:3000` খুলুন → **Inbox** অথবা **AI Agent** → **Enable automatic Gemini replies** টিক দিন → **Save AI settings**।
8. ngrok-এর **একটি** টানেল চালু রাখুন, `localhost:3000`-তে Forwarding থাকতে হবে। পুরোনো ngrok URL পরিবর্তিত না হলে Telegram webhook পুনরায় রেজিস্টার করার প্রয়োজন নেই।
9. Telegram Bot-এ **নতুন** একটি মেসেজ পাঠান। AI উত্তর দিলে Inbox-এ `Gemini AI` লেখা থাকবে।
10. Inbox থেকে নিজে Reply দিলে ওই চ্যাটে AI থেমে যাবে। `Human mode · Resume AI` চাপলে আবার নতুন মেসেজে AI উত্তর দেবে।

## সমস্যা হলে

- Telegram Inbox-এ মেসেজ আসে, কিন্তু AI উত্তর দেয় না → SQL Run হয়েছে কি না, Gemini key ঠিক আছে কি না, `npm run dev` Restart হয়েছে কি না, AI ON এবং Human mode OFF কি না দেখুন।
- Next.js Terminal-এ `Gemini HTTP 400/404/429` থাকলে model/API key/quota পরীক্ষা করুন।
- এই সংস্করণে `Gemini` শুধু Telegram-এর টেক্সট মেসেজের উত্তর দেয়। Order approval, refund বা inventory পরিবর্তন করতে পারে না।
- এটি **লোকাল টেস্টিং MVP**। লাইভ ক্লায়েন্টের জন্য production security, worker queue এবং live testing প্রয়োজন।
