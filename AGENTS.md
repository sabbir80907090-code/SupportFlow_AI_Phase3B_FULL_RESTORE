# SupportFlow AI project requirements

SupportFlow AI is a multi-tenant commercial customer-support SaaS, not a single-business bot.

- Dashboard-first, 100% customer self-service. New businesses must not require developer changes to GitHub, Vercel, Supabase or environment variables.
- One account = one business. Isolate all business data and configuration; enforce authorization server-side and database RLS.
- Customers manage their channel connections, provider API keys, models, AI auto reply, prompts and knowledge in their dashboard.
- Encrypt API keys and channel tokens. Never expose another tenant's credentials or data.
- Central AI and delivery workers must use each business's own settings.
- Design for thousands of businesses, bounded processing, reliable retries and automation.
- Before feature deployment check security, build, workers and end-to-end behavior. Report any unverified path explicitly.
- Stack: Next.js, Supabase, Vercel, GitHub; Gemini/OpenAI/Anthropic.

## Future roadmap — not current scope

After the customer SaaS is production-ready, build a separate Super Admin application for account/business management, subscriptions/pricing/billing, platform usage/analytics, support/status, connections/worker health, feature/settings management, audit logs/security/RBAC and job/error monitoring. Its access and authorization must be separate from the customer dashboard, with strong authentication and preserved tenant isolation.
