# Dashboard knowledge imports

Owners use **Knowledge → Import business knowledge**. Paste a public HTTPS URL, optionally enable linked pages, or upload TXT/Markdown/CSV. Review/edit/remove extracted sections, then save. CSV is reference text, not product inventory. Products remains the authoritative price and stock catalog.

Website imports follow up to 20 same-origin linked pages, capped at 120,000 total characters. Each request has a 2 MB response cap and the existing DNS-pinned public-URL/redirect validation. Login/account/cart URLs, query-string links and common binary assets are excluded. This is a bounded HTML link scan, not a sitemap crawler or JavaScript renderer. Keep the tab open. Stop scan retains completed pages for review. Failed pages and reached limits are displayed. No remote scripts execute.

Text documents are limited to 1 MB and 120,000 characters. Oversized text is rejected explicitly, never silently truncated. Text is split into <=2,500-character sections. PDF, DOCX, OCR, Google Drive sync and scheduled refresh are not included.

Save uses the authenticated browser client and existing knowledge_articles RLS; business_id is included on reads and writes. Bulk inserts are atomic. Exact content duplicates are skipped against the latest 1,000 returned articles and within the batch; concurrent imports may still duplicate content. Existing articles are not overwritten. Imported sections can be edited/deleted using the existing article controls.

AI selects relevant sections from the latest 500 tenant-scoped articles using lexical matches, with a 9,000-character context budget. This improves access to older facts within that window but is not embedding/vector search and does not guarantee exhaustive knowledge retrieval. No schema or AI key changes are needed.

Validation: parser/chunking/retrieval tests, existing SSRF/auth/worker tests, production build. Production RLS policies inspected. An owner-session website scan/save/AI conversation must still be checked after deployment; test mocks do not establish live end-to-end delivery.
