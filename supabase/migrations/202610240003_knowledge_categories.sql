alter table public.knowledge_articles add column if not exists category text not null default 'General';
alter table public.knowledge_articles add column if not exists source_filename text;
create index if not exists knowledge_articles_business_category_idx on public.knowledge_articles(business_id,category);
