# Main feature merge — 2026-11-08

User authorized merging moderator invitations and advanced website product import into main. Moderator invitations were already included in main aaf150b and remain intact.

Merged advanced import with current main 198a8dd, retaining both explicit x-business-id headers in ProductUrlImport and all workspace/password changes. Source comparison confirmed those headers were the only substantive overlapping edits.

Production database inspection found website_sync_connections, website_sync_pages and website_sync_runs absent. This merge includes the additive SQL file but does not execute migrations or enable a scheduler. Automatic sync therefore still needs database setup and functional testing before use. Whole-site one-time import uses the existing business authorization and import quota.

Preview build and final production deployment must be checked in Vercel. Authenticated import/sync and cross-workspace end-to-end verification remain outstanding. No customer records or credentials changed.
