-- REQUIRED ONE-TIME MIGRATION for the EXISTING tables in the user's schema.
-- Do NOT re-create users/products/orders/etc. Run once in Supabase SQL Editor.
-- Back up data first. Remove pre-existing duplicate cart pairs / order idempotency keys
-- if the two unique indexes fail.

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_one_product_per_user
  ON public.cart_items(user_id, product_id);
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_checkout_key_per_user
  ON public.orders(user_id, idempotency_key);

-- All checkout reads, discounts, stock reservations, coupon usage, payment creation,
-- cart removal and status history take place in ONE PostgreSQL transaction.
CREATE OR REPLACE FUNCTION public.place_store_order(
  p_user_id uuid, p_shipping text, p_idempotency_key text,
  p_coupon_code text DEFAULT NULL, p_method text DEFAULT 'cod'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_coupon public.coupons%ROWTYPE;
  v_item record;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_total numeric := 0;
  v_count integer := 0;
  v_used integer := 0;
BEGIN
  IF p_method NOT IN ('cod','maya') THEN RAISE EXCEPTION 'Unsupported payment method' USING ERRCODE='P0001'; END IF;
  IF length(trim(p_shipping)) < 10 OR length(p_shipping) > 500 THEN
    RAISE EXCEPTION 'Shipping address must be 10-500 characters' USING ERRCODE='P0001';
  END IF;
  IF length(p_idempotency_key) < 8 OR length(p_idempotency_key) > 100 THEN
    RAISE EXCEPTION 'Invalid checkout key' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id=p_user_id AND role='customer') THEN
    RAISE EXCEPTION 'A customer account is required for checkout' USING ERRCODE='P0001';
  END IF;

  -- Serializes retries for the same customer and key, even when two requests arrive at once.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text||':'||p_idempotency_key,0));
  SELECT * INTO v_order FROM public.orders
    WHERE user_id=p_user_id AND idempotency_key=p_idempotency_key
    LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('created',false,'order',to_jsonb(v_order)); END IF;

  -- Lock the cart + product rows before checking inventory and calculating server totals.
  FOR v_item IN
    SELECT c.id AS cart_id,c.quantity,p.id,p.name,p.price,p.stock,p.active
      FROM public.cart_items c JOIN public.products p ON p.id=c.product_id
      WHERE c.user_id=p_user_id ORDER BY p.id
      FOR UPDATE OF c,p
  LOOP
    IF NOT v_item.active OR v_item.quantity<1 OR v_item.quantity>v_item.stock THEN
      RAISE EXCEPTION 'One or more products are unavailable or out of stock' USING ERRCODE='P0001';
    END IF;
    v_subtotal := v_subtotal + round(v_item.price * v_item.quantity,2);
    v_count := v_count+1;
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'Your cart is empty' USING ERRCODE='P0001'; END IF;
  v_subtotal:=round(v_subtotal,2);

  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code)<>'' THEN
    SELECT * INTO v_coupon FROM public.coupons
      WHERE upper(code)=upper(btrim(p_coupon_code)) AND active=true
      FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found' USING ERRCODE='P0001'; END IF;
    IF v_coupon.expires_at<=now() OR v_subtotal<coalesce(v_coupon.min_spend,0) THEN
      RAISE EXCEPTION 'Coupon expired or minimum spend not reached' USING ERRCODE='P0001';
    END IF;
    IF v_coupon.usage_limit IS NOT NULL AND coalesce(v_coupon.used_count,0)>=v_coupon.usage_limit THEN
      RAISE EXCEPTION 'Coupon usage limit reached' USING ERRCODE='P0001';
    END IF;
    IF v_coupon.per_customer_limit IS NOT NULL THEN
      SELECT count(*) INTO v_used FROM public.coupon_uses
        WHERE coupon_id=v_coupon.id AND user_id=p_user_id;
      IF v_used>=v_coupon.per_customer_limit THEN
        RAISE EXCEPTION 'Coupon limit for this account reached' USING ERRCODE='P0001';
      END IF;
    END IF;
    IF v_coupon.type='percentage' THEN
      IF v_coupon.value<0 OR v_coupon.value>100 THEN RAISE EXCEPTION 'Invalid coupon percentage' USING ERRCODE='P0001'; END IF;
      v_discount:=round(v_subtotal*v_coupon.value/100,2);
    ELSIF v_coupon.type='fixed' THEN
      IF v_coupon.value<0 THEN RAISE EXCEPTION 'Invalid coupon value' USING ERRCODE='P0001'; END IF;
      v_discount:=least(v_subtotal,v_coupon.value);
    ELSE
      RAISE EXCEPTION 'Unsupported coupon type' USING ERRCODE='P0001';
    END IF;
  END IF;
  v_total:=round(greatest(0,v_subtotal-v_discount),2);

  INSERT INTO public.orders(user_id,status,subtotal,discount,total,shipping_address,idempotency_key)
  VALUES(p_user_id,'pending_payment',v_subtotal,v_discount,v_total,btrim(p_shipping),p_idempotency_key)
  RETURNING * INTO v_order;

  FOR v_item IN
    SELECT c.quantity,p.id,p.name,p.price FROM public.cart_items c
      JOIN public.products p ON p.id=c.product_id WHERE c.user_id=p_user_id ORDER BY p.id
  LOOP
    UPDATE public.products SET stock=stock-v_item.quantity WHERE id=v_item.id AND stock>=v_item.quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock during checkout' USING ERRCODE='P0001'; END IF;
    INSERT INTO public.order_items(order_id,product_id,name,unit_price,quantity,line_total)
      VALUES(v_order.id,v_item.id,v_item.name,v_item.price,v_item.quantity,round(v_item.price*v_item.quantity,2));
  END LOOP;

  INSERT INTO public.payments(order_id,status,amount,currency,raw_payload)
    VALUES(v_order.id,CASE WHEN p_method='cod' THEN 'cod_pending' ELSE 'maya_pending' END,v_total,'PHP',
      jsonb_build_object('method',p_method));

  IF v_coupon.id IS NOT NULL THEN
    INSERT INTO public.coupon_uses(coupon_id,user_id,order_id) VALUES(v_coupon.id,p_user_id,v_order.id);
    UPDATE public.coupons SET used_count=coalesce(used_count,0)+1 WHERE id=v_coupon.id;
  END IF;

  INSERT INTO public.order_status_history(order_id,status,actor_id) VALUES(v_order.id,v_order.status,p_user_id);
  DELETE FROM public.cart_items WHERE user_id=p_user_id;
  RETURN jsonb_build_object('created',true,'order',to_jsonb(v_order));
END; $$;

-- Accept only legal fulfillment transitions; never allow a fake "paid" via admin input.
CREATE OR REPLACE FUNCTION public.transition_store_order(
  p_order_id uuid, p_actor_id uuid, p_status text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_line record;
  v_coupon_id uuid;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND role='admin') THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment record missing' USING ERRCODE='P0001'; END IF;

  IF p_status='cancelled' AND v_payment.status='cod_pending'
    AND v_order.status IN ('pending_payment','processing') THEN
    FOR v_line IN SELECT product_id,quantity FROM public.order_items WHERE order_id=p_order_id LOOP
      UPDATE public.products SET stock=stock+v_line.quantity WHERE id=v_line.product_id;
    END LOOP;
    SELECT coupon_id INTO v_coupon_id FROM public.coupon_uses WHERE order_id=p_order_id;
    IF v_coupon_id IS NOT NULL THEN
      DELETE FROM public.coupon_uses WHERE order_id=p_order_id;
      UPDATE public.coupons SET used_count=greatest(0,coalesce(used_count,0)-1) WHERE id=v_coupon_id;
    END IF;
    UPDATE public.payments SET status='cancelled',updated_at=now() WHERE id=v_payment.id;
  ELSIF p_status='processing' AND
    ((v_order.status='pending_payment' AND v_payment.status='cod_pending') OR
     (v_order.status='paid' AND v_payment.status='paid')) THEN
    NULL;
  ELSIF p_status='shipped' AND v_order.status='processing' THEN
    NULL;
  ELSIF p_status='delivered' AND v_order.status='shipped' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'Illegal order status transition for current payment state' USING ERRCODE='P0001';
  END IF;
  UPDATE public.orders SET status=p_status WHERE id=p_order_id RETURNING * INTO v_order;
  INSERT INTO public.order_status_history(order_id,status,actor_id) VALUES(p_order_id,p_status,p_actor_id);
  RETURN to_jsonb(v_order);
END; $$;

-- COD collections count as revenue only after an admin confirms receipt of money.
CREATE OR REPLACE FUNCTION public.confirm_cod_payment(p_order_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_order public.orders%ROWTYPE; v_payment public.payments%ROWTYPE;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor_id AND role='admin') THEN
    RAISE EXCEPTION 'Administrator required' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.status <> 'delivered' THEN
    RAISE EXCEPTION 'COD can be collected only for delivered orders' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO v_payment FROM public.payments WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_payment.status<>'cod_pending' THEN
    RAISE EXCEPTION 'This order has no pending COD payment' USING ERRCODE='P0001';
  END IF;
  UPDATE public.payments SET status='paid',updated_at=now() WHERE id=v_payment.id;
  UPDATE public.orders SET paid_at=now() WHERE id=p_order_id RETURNING * INTO v_order;
  RETURN to_jsonb(v_order);
END; $$;

-- After Maya creates a hosted checkout, persist both matching checkout IDs atomically.
CREATE OR REPLACE FUNCTION public.attach_maya_checkout(
  p_order_id uuid,p_checkout_id text,p_checkout_url text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public, pg_catalog AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_payment.raw_payload->>'method'<>'maya' OR v_payment.status<>'maya_pending' THEN
    RAISE EXCEPTION 'Maya payment is not pending' USING ERRCODE='P0001';
  END IF;
  IF v_order.gateway_checkout_id IS NULL THEN
    UPDATE public.orders SET gateway_checkout_id=p_checkout_id WHERE id=p_order_id;
    UPDATE public.payments SET gateway_checkout_id=p_checkout_id,
      raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object('checkout_url',p_checkout_url,'created_at',now())
      WHERE id=v_payment.id;
    RETURN jsonb_build_object('gateway_checkout_id',p_checkout_id,'checkout_url',p_checkout_url);
  END IF;
  RETURN jsonb_build_object('gateway_checkout_id',v_order.gateway_checkout_id,
    'checkout_url',v_payment.raw_payload->>'checkout_url');
END; $$;

-- Verified Maya notifications are recorded and applied together, with amount/currency checks.
CREATE OR REPLACE FUNCTION public.record_maya_payment_event(
  p_order_id uuid,p_event_id text,p_payment_id text,p_status text,
  p_amount numeric,p_currency text,p_payload jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_count integer;
  v_line record;
  v_coupon_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found for this Maya reference' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE order_id=p_order_id FOR UPDATE;
  IF NOT FOUND OR v_payment.gateway_checkout_id IS NULL OR
     v_payment.raw_payload->>'method'<>'maya' OR v_order.gateway_checkout_id IS NULL THEN
    RAISE EXCEPTION 'No initialized Maya checkout matches this order' USING ERRCODE='P0001';
  END IF;
  IF p_currency<>'PHP' OR round(p_amount,2)<>round(v_order.total,2) THEN
    RAISE EXCEPTION 'Maya payment amount/currency does not match order' USING ERRCODE='P0001';
  END IF;
  IF p_status NOT IN ('PAYMENT_SUCCESS','PAYMENT_FAILED','PAYMENT_CANCELLED') THEN
    RAISE EXCEPTION 'Unsupported Maya payment event' USING ERRCODE='P0001';
  END IF;
  INSERT INTO public.payment_events(event_id,payload) VALUES(p_event_id,p_payload) ON CONFLICT(event_id) DO NOTHING;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count=0 THEN RETURN jsonb_build_object('duplicate',true); END IF;

  -- A late conflicting event cannot reverse a finalized payment or cancellation.
  IF v_payment.status NOT IN ('maya_pending') OR v_order.status<>'pending_payment' THEN
    RETURN jsonb_build_object('ignored',true,'reason','payment already finalized');
  END IF;
  IF p_status='PAYMENT_SUCCESS' THEN
    UPDATE public.payments SET status='paid',gateway_payment_id=p_payment_id,
      raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object('last_event',p_payload),updated_at=now()
      WHERE id=v_payment.id;
    UPDATE public.orders SET status='paid',paid_at=now() WHERE id=p_order_id;
    INSERT INTO public.order_status_history(order_id,status) VALUES(p_order_id,'paid');
  ELSE
    UPDATE public.payments SET status='failed',gateway_payment_id=p_payment_id,
      raw_payload=coalesce(raw_payload,'{}'::jsonb)||jsonb_build_object('last_event',p_payload),updated_at=now()
      WHERE id=v_payment.id;
    UPDATE public.orders SET status='payment_failed' WHERE id=p_order_id;
    FOR v_line IN SELECT product_id,quantity FROM public.order_items WHERE order_id=p_order_id LOOP
      UPDATE public.products SET stock=stock+v_line.quantity WHERE id=v_line.product_id;
    END LOOP;
    SELECT coupon_id INTO v_coupon_id FROM public.coupon_uses WHERE order_id=p_order_id;
    IF v_coupon_id IS NOT NULL THEN
      DELETE FROM public.coupon_uses WHERE order_id=p_order_id;
      UPDATE public.coupons SET used_count=greatest(0,coalesce(used_count,0)-1) WHERE id=v_coupon_id;
    END IF;
    INSERT INTO public.order_status_history(order_id,status) VALUES(p_order_id,'payment_failed');
  END IF;
  RETURN jsonb_build_object('processed',true,'status',p_status);
END; $$;

-- Aggregates across the full table; not limited by Supabase PostgREST page size.
CREATE OR REPLACE FUNCTION public.get_store_dashboard()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE
  v_paid_orders integer;
  v_gross numeric;
  v_pending integer;
  v_low jsonb;
BEGIN
  SELECT count(*)::integer,coalesce(sum(amount),0) INTO v_paid_orders,v_gross
    FROM public.payments WHERE status='paid';
  SELECT count(*)::integer INTO v_pending FROM public.orders WHERE status='pending_payment';
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) INTO v_low FROM (
    SELECT id,name,stock FROM public.products WHERE active=true AND stock<=10 ORDER BY stock,name LIMIT 50
  ) t;
  RETURN jsonb_build_object('paidOrders',v_paid_orders,'grossSales',v_gross,'pendingOrders',v_pending,'lowStock',v_low);
END; $$;

-- Supabase anonymous/authenticated browser roles cannot invoke privileged RPCs.
REVOKE ALL ON FUNCTION public.place_store_order(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.transition_store_order(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.confirm_cod_payment(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_maya_payment_event(uuid,text,text,text,numeric,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_store_order(uuid,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transition_store_order(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_cod_payment(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_maya_payment_event(uuid,text,text,text,numeric,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.get_store_dashboard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_store_dashboard() TO service_role;
REVOKE ALL ON FUNCTION public.attach_maya_checkout(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.attach_maya_checkout(uuid,text,text) TO service_role;
