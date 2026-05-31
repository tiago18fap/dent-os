-- Migration: Add reativacao_pendente flag to clinicas table
-- When a clinic reactivates after being blocked, this flag controls
-- whether the reactivation review screen should be shown.
-- Created at: 2026-05-31

ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS reativacao_pendente BOOLEAN DEFAULT FALSE;
