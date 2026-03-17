-- Add public_ip column to hosts table for echo-service-derived IP
ALTER TABLE hosts ADD COLUMN public_ip TEXT;
