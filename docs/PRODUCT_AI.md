# Product-aware support replies

The shared AI worker now ranks up to 500 active products belonging to the job's business using the current customer question (name, exact SKU, category, description). It supplies up to 12 complete records, instead of truncating a newest-60 catalog mid-record. Generic follow-up questions can use the preceding inbound product reference. Matching is lexical, not semantic: include common Bangla/English names and model aliases in product descriptions.

For matched products the worker downloads at most three catalog photos from the private business-product-images bucket. The path must belong to the same business and use the supported upload layout. Photos are bounded to 5 MB each / 8 MB total and a five-second download timeout. Private URLs, tokens and storage paths are not sent to customers. Gemini, OpenAI and Anthropic receive labelled inline images on the last user turn, associated with product identity. A provider rejecting image input gets one text-only attempt before moving to the next enabled key. Missing photos do not block text answers.

Catalog price/currency/stock take precedence over photo labels. Prompts prohibit inventing specifications, warranty, availability and missing-product claims, and instruct the model to clarify ambiguous variants. These are model instructions, not a guarantee of perfect answers. Product descriptions and text visible in photos are untrusted reference data. Custom prompts remain lower priority.

## Setup and limits

In Product Management add the name, SKU, price/currency, stock, factual description and optional photo; enable Active. Use a vision-capable model in AI settings for visual answers. The existing business API key pays for image input as well as text. This change analyses owner-uploaded catalog images; it does not add inbound customer-photo recognition or outgoing photo attachments. Replies remain text.

## Verification

Production Next.js build and 24 automated tests pass, including Bengali/SKU matching, older catalog records, ambiguous variants, contextual follow-ups, tenant path isolation, all three provider payloads, and an AI-worker test covering unsupported-image fallback and a single scoped outbox reply. Production catalog inspection confirmed the image_path column and a saved active product with photo. Real-provider visual accuracy and actual customer-device delivery still need a controlled conversation using the owner's configured model.
