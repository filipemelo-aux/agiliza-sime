
-- Add tipo_operacional to financial_categories
ALTER TABLE public.financial_categories ADD COLUMN IF NOT EXISTS tipo_operacional text DEFAULT NULL;

-- Comment explaining valid values
COMMENT ON COLUMN public.financial_categories.tipo_operacional IS 'Operational behavior trigger: manutencao, combustivel, or NULL for generic categories';

-- Insert seed categories based on old expense_type enum values (only if they don't exist)
INSERT INTO public.financial_categories (name, type, tipo_operacional, active)
SELECT name, type, tipo_operacional, true
FROM (VALUES
  ('Combustível', 'payable', 'combustivel'),
  ('Manutenção', 'payable', 'manutencao'),
  ('Pedágio', 'payable', NULL),
  ('Multa', 'payable', NULL),
  ('Administrativo', 'payable', NULL),
  ('Frete Terceiro', 'payable', NULL),
  ('Imposto', 'payable', NULL),
  ('Outros', 'payable', NULL)
) AS v(name, type, tipo_operacional)
WHERE NOT EXISTS (
  SELECT 1 FROM public.financial_categories fc WHERE fc.name = v.name AND fc.type = v.type
);
