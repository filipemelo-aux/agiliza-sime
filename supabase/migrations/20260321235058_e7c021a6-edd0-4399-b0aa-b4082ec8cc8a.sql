
CREATE TABLE public.fuel_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number serial NOT NULL,
  establishment_id uuid NOT NULL REFERENCES public.fiscal_establishments(id),
  requester_user_id uuid NOT NULL,
  requester_name text NOT NULL,
  supplier_id uuid REFERENCES public.profiles(id),
  supplier_name text NOT NULL,
  vehicle_id uuid REFERENCES public.vehicles(id),
  vehicle_plate text NOT NULL,
  fuel_type text NOT NULL,
  fill_mode text NOT NULL DEFAULT 'completar',
  liters numeric NULL,
  notes text NULL,
  status text NOT NULL DEFAULT 'pendente',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fuel_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can select fuel_orders" ON public.fuel_orders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert fuel_orders" ON public.fuel_orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update fuel_orders" ON public.fuel_orders FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete fuel_orders" ON public.fuel_orders FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Moderators can select fuel_orders" ON public.fuel_orders FOR SELECT TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can insert fuel_orders" ON public.fuel_orders FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can update fuel_orders" ON public.fuel_orders FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'moderator'));
CREATE POLICY "Moderators can delete fuel_orders" ON public.fuel_orders FOR DELETE TO authenticated USING (has_role(auth.uid(), 'moderator'));
