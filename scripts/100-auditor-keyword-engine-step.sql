begin;

alter table public.auditor_scans
  drop constraint if exists auditor_scans_step_check;

alter table public.auditor_scans
  add constraint auditor_scans_step_check
  check (
    step in (
      'normalize',
      'robots',
      'sitemap',
      'ai_files',
      'sample',
      'fetch_pages',
      'extract',
      'keyword_engine',
      'keyword_analysis',
      'topic_discovery',
      'rules',
      'ai_readiness',
      'competitor_discovery',
      'competitor_crawl',
      'competitor_keywords',
      'content_gap_analysis',
      'recommendations',
      'persist',
      'done'
    )
  );

commit;

select pg_notify('pgrst', 'reload schema');
