-- Add distance_m column to splits table for distance-based chart alignment
ALTER TABLE splits ADD COLUMN distance_m numeric;
