## Website Sync Preview · 2026-11-06

The dils8xp78 Preview was built before the branch-specific staging URL and publishable key were configured. The sync tables exist in staging. The production database lacks the sync tables. The API reads connections through the server-side Supabase client after checking workspace membership.

The feature branch has overrides for the two public settings. It also needs a Preview branch override for SUPABASE_SERVICE_ROLE_KEY from the same staging project. After configuring it in Vercel, deploy a fresh Preview and verify listing, connecting and Sync now in an authorized staging workspace. Scheduled background sync requires separate verification. No production rollout was performed.
