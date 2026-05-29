-- Migration: Add cnpj column to public.clinicas table
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS cnpj TEXT;
