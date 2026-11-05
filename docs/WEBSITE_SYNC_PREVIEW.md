## Website Sync Preview · 2026-11-06

The dils8xp78 Preview was built before the branch-specific staging URL and publishable key were configured. The sync tables exist in staging. The production database lacks the sync tables. The API reads connections through the server-side Supabase client after checking workspace membership.

The feature branch has overrides for the two public settings. It also needs a Preview branch override for SUPABASE_SERVICE_ROLE_KEY from the same staging project. After configuring it in Vercel, deploy a fresh Preview and verify listing, connecting and Sync now in an authorized staging workspace. Scheduled background sync requires separate verification. No production rollout was performed.

The branch server key override was subsequently saved and deployment dpl_BVbccCgQoFamb2A7UzkFMNFhk8gG reached READY. Staging email confirmation succeeded, but its return URL led to localhost. Set the staging Auth Site URL to the stable feature-branch Preview alias in the dashboard. Signed-in website sync remains to be verified.

Preview diagnosis: the workspace owner exists. Staging gateway logs report UNAUTHORIZED_INVALID_API_KEY (bad_checksum) on the server-side user checks. Replace the existing branch-specific server credential with an exact copy of a valid Staging secret, then redeploy Preview and retest the signed-in connection list. No credentials are recorded here.
