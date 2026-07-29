-- Supports targeted maintenance of candidates selected by normalization evidence
-- without scanning or downloading the full product_candidates table.
create index if not exists product_candidates_classification_evidence_gin_idx
  on public.product_candidates using gin (classification_evidence jsonb_path_ops);
