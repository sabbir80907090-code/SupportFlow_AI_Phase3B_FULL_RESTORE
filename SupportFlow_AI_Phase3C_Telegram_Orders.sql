-- SupportFlow AI Phase 3C: Telegram order requests (apply after Phase 3B).
-- This migration does not delete or modify existing orders.
-- Test on a Supabase staging copy before running on production.

CREATE TABLE IF NOT EXISTS public.telegram_order_drafts (
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  step text NOT NULL DEFAULT 'name'
    CHECK (step IN ('name','phone','product','quantity','address','confirm','completed','cancelled')),
  customer_name text,
  phone text,
  product text,
  quantity integer,
  delivery_address text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  last_message_id bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, conversation_id),
  FOREIGN KEY (business_id, conversation_id)
    REFERENCES public.telegram_conversations(business_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.order_delivery_details (
  order_id uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  delivery_address text NOT NULL CHECK (char_length(delivery_address) BETWEEN 8 AND 400),
  telegram_conversation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.telegram_order_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_order_drafts, public.order_delivery_details FROM anon, authenticated;
GRANT SELECT ON public.order_delivery_details TO authenticated;

DROP POLICY IF EXISTS order_delivery_member_read ON public.order_delivery_details;
CREATE POLICY order_delivery_member_read ON public.order_delivery_details
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.business_members m
      WHERE m.business_id = order_delivery_details.business_id
        AND m.user_id = (SELECT auth.uid())
    )
  );

-- Only the server-side service role may call this function.
-- Row locks and last_message_id prevent repeated Telegram deliveries from
-- creating duplicate orders or advancing the draft twice.
CREATE OR REPLACE FUNCTION public.handle_telegram_order_message(
  p_business_id uuid,
  p_conversation_id uuid,
  p_message_id bigint,
  p_text text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  d public.telegram_order_drafts%ROWTYPE;
  v_text text := btrim(coalesce(p_text, ''));
  v_lower text := lower(v_text);
  v_start boolean;
  v_cancel boolean;
  v_customer_id uuid;
  v_order_id uuid;
  v_order_number text;
  v_inserted_count integer;
BEGIN
  IF p_message_id IS NULL OR p_message_id <= 0 OR length(v_text) > 4096 THEN
    RETURN jsonb_build_object('handled',false);
  END IF;

  -- A chat must already belong to the configured business.
  IF NOT EXISTS (
    SELECT 1 FROM public.telegram_conversations c
    WHERE c.business_id = p_business_id AND c.id = p_conversation_id
  ) THEN
    RETURN jsonb_build_object('handled',false);
  END IF;

  v_start := v_lower ~ '^(/order(@[a-z0-9_]+)?|place order|i want to order|i want to place an order|অর্ডার করতে চাই|অর্ডার করব|অর্ডার করবো)$';
  v_cancel := v_lower IN ('/cancel','cancel','বাতিল');

  -- If no active draft exists, ordinary messages continue to Gemini AI.
  SELECT * INTO d FROM public.telegram_order_drafts
  WHERE business_id=p_business_id AND conversation_id=p_conversation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF NOT v_start THEN RETURN jsonb_build_object('handled',false); END IF;
    INSERT INTO public.telegram_order_drafts
      (business_id,conversation_id,step,last_message_id)
    VALUES (p_business_id,p_conversation_id,'name',p_message_id)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    SELECT * INTO d FROM public.telegram_order_drafts
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id
    FOR UPDATE;
    IF v_inserted_count = 1 THEN
      RETURN jsonb_build_object('handled',true,'reply','অর্ডার শুরু হয়েছে। আপনার নাম লিখুন।');
    END IF;
    IF d.last_message_id >= p_message_id THEN
      RETURN jsonb_build_object('handled',true);
    END IF;
  END IF;

  IF p_message_id <= d.last_message_id THEN
    RETURN jsonb_build_object('handled',true);
  END IF;

  IF v_start THEN
    UPDATE public.telegram_order_drafts
    SET step='name',customer_name=NULL,phone=NULL,product=NULL,
        quantity=NULL,delivery_address=NULL,order_id=NULL,
        last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','নতুন অর্ডার শুরু হয়েছে। আপনার নাম লিখুন।');
  END IF;

  IF d.step IN ('completed','cancelled') THEN
    RETURN jsonb_build_object('handled',false);
  END IF;

  IF v_cancel THEN
    UPDATE public.telegram_order_drafts
    SET step='cancelled',last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','অর্ডার অনুরোধ বাতিল করা হয়েছে। নতুন অর্ডার দিতে /order লিখুন।');
  END IF;

  IF d.step='name' THEN
    IF length(v_text) < 2 OR length(v_text) > 120 THEN
      RETURN jsonb_build_object('handled',true,'reply','অনুগ্রহ করে ২–১২০ অক্ষরের নাম লিখুন।');
    END IF;
    UPDATE public.telegram_order_drafts SET customer_name=v_text,step='phone',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','ধন্যবাদ। আপনার ফোন নম্বর লিখুন (৭–২০ অঙ্ক/চিহ্ন)।');
  ELSIF d.step='phone' THEN
    IF length(v_text) < 7 OR length(v_text) > 20 OR v_text !~ '^\+?[0-9 ()-]+$' THEN
      RETURN jsonb_build_object('handled',true,'reply','ফোন নম্বরটি সঠিকভাবে লিখুন (যেমন +8801XXXXXXXXX)।');
    END IF;
    UPDATE public.telegram_order_drafts SET phone=v_text,step='product',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','কোন পণ্য অর্ডার করতে চান? পণ্যের নাম লিখুন।');
  ELSIF d.step='product' THEN
    IF length(v_text) < 2 OR length(v_text) > 300 THEN
      RETURN jsonb_build_object('handled',true,'reply','পণ্যের নাম ২–৩০০ অক্ষরের মধ্যে লিখুন।');
    END IF;
    UPDATE public.telegram_order_drafts SET product=v_text,step='quantity',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','কয়টি নিতে চান? শুধু সংখ্যা লিখুন (১–৯৯৯)।');
  ELSIF d.step='quantity' THEN
    IF v_text !~ '^[0-9]{1,3}
    UPDATE public.telegram_order_drafts SET quantity=v_text::integer,step='address',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','ডেলিভারির ঠিকানা লিখুন। ঠিকানা শুধু অর্ডার পরিচালনার জন্য সংরক্ষিত হবে।');
  ELSIF d.step='address' THEN
    IF length(v_text) < 8 OR length(v_text) > 400 THEN
      RETURN jsonb_build_object('handled',true,'reply','ঠিকানা ৮–৪০০ অক্ষরের মধ্যে লিখুন।');
    END IF;
    UPDATE public.telegram_order_drafts SET delivery_address=v_text,step='confirm',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply',
      'অর্ডার যাচাই করুন:'||E'\n'||
      'নাম: '||d.customer_name||E'\n'||
      'ফোন: '||d.phone||E'\n'||
      'পণ্য: '||d.product||E'\n'||
      'পরিমাণ: '||d.quantity||E'\n'||
      'ঠিকানা: '||v_text||E'\n\n'||
      'সঠিক হলে YES লিখুন, বাতিল করতে NO লিখুন। দাম ও স্টক এখনো নিশ্চিত করা হয়নি।');
  ELSIF d.step='confirm' THEN
    IF v_lower IN ('no','না') THEN
      UPDATE public.telegram_order_drafts SET step='cancelled',
        last_message_id=p_message_id,updated_at=now()
      WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
      RETURN jsonb_build_object('handled',true,'reply','অর্ডার বাতিল করা হয়েছে। আবার শুরু করতে /order লিখুন।');
    END IF;
    IF v_lower NOT IN ('yes','হ্যাঁ','হ্যা') THEN
      RETURN jsonb_build_object('handled',true,'reply','অর্ডার সেভ করতে YES অথবা বাতিল করতে NO লিখুন।');
    END IF;

    INSERT INTO public.customers (business_id,name,phone)
    VALUES (p_business_id,d.customer_name,d.phone)
    RETURNING id INTO v_customer_id;

    INSERT INTO public.orders (business_id,customer_id,product_details,total_amount,currency,status)
    VALUES (p_business_id,v_customer_id,d.product||' × '||d.quantity,NULL,'BDT','pending')
    RETURNING id,order_number INTO v_order_id,v_order_number;

    INSERT INTO public.order_delivery_details
      (order_id,business_id,delivery_address,telegram_conversation_id)
    VALUES (v_order_id,p_business_id,d.delivery_address,p_conversation_id);

    UPDATE public.telegram_order_drafts SET step='completed',order_id=v_order_id,
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;

    RETURN jsonb_build_object('handled',true,'order_created',true,'order_id',v_order_id,
      'reply','আপনার অর্ডার অনুরোধ সংরক্ষিত হয়েছে। অর্ডার নম্বর: '||
        coalesce(v_order_number,v_order_id::text)||E'\n'||
        'স্ট্যাটাস: Pending। ব্যবসার টিম যাচাই করে সিদ্ধান্ত জানাবে।');
  END IF;

  RETURN jsonb_build_object('handled',false);
END;
$$;

REVOKE ALL ON FUNCTION public.handle_telegram_order_message(uuid,uuid,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_telegram_order_message(uuid,uuid,bigint,text)
  TO service_role;
 THEN
      RETURN jsonb_build_object('handled',true,'reply','অনুগ্রহ করে ১ থেকে ৯৯৯-এর মধ্যে সংখ্যা লিখুন।');
    END IF;
    IF v_text::integer NOT BETWEEN 1 AND 999 THEN
      RETURN jsonb_build_object('handled',true,'reply','অনুগ্রহ করে ১ থেকে ৯৯৯-এর মধ্যে সংখ্যা লিখুন।');
    END IF;
    UPDATE public.telegram_order_drafts SET quantity=v_text::integer,step='address',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply','ডেলিভারির ঠিকানা লিখুন। ঠিকানা শুধু অর্ডার পরিচালনার জন্য সংরক্ষিত হবে।');
  ELSIF d.step='address' THEN
    IF length(v_text) < 8 OR length(v_text) > 400 THEN
      RETURN jsonb_build_object('handled',true,'reply','ঠিকানা ৮–৪০০ অক্ষরের মধ্যে লিখুন।');
    END IF;
    UPDATE public.telegram_order_drafts SET delivery_address=v_text,step='confirm',
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
    RETURN jsonb_build_object('handled',true,'reply',
      'অর্ডার যাচাই করুন:'||E'\n'||
      'নাম: '||d.customer_name||E'\n'||
      'ফোন: '||d.phone||E'\n'||
      'পণ্য: '||d.product||E'\n'||
      'পরিমাণ: '||d.quantity||E'\n'||
      'ঠিকানা: '||v_text||E'\n\n'||
      'সঠিক হলে YES লিখুন, বাতিল করতে NO লিখুন। দাম ও স্টক এখনো নিশ্চিত করা হয়নি।');
  ELSIF d.step='confirm' THEN
    IF v_lower IN ('no','না') THEN
      UPDATE public.telegram_order_drafts SET step='cancelled',
        last_message_id=p_message_id,updated_at=now()
      WHERE business_id=p_business_id AND conversation_id=p_conversation_id;
      RETURN jsonb_build_object('handled',true,'reply','অর্ডার বাতিল করা হয়েছে। আবার শুরু করতে /order লিখুন।');
    END IF;
    IF v_lower NOT IN ('yes','হ্যাঁ','হ্যা') THEN
      RETURN jsonb_build_object('handled',true,'reply','অর্ডার সেভ করতে YES অথবা বাতিল করতে NO লিখুন।');
    END IF;

    INSERT INTO public.customers (business_id,name,phone)
    VALUES (p_business_id,d.customer_name,d.phone)
    RETURNING id INTO v_customer_id;

    INSERT INTO public.orders (business_id,customer_id,product_details,total_amount,currency,status)
    VALUES (p_business_id,v_customer_id,d.product||' × '||d.quantity,NULL,'BDT','pending')
    RETURNING id,order_number INTO v_order_id,v_order_number;

    INSERT INTO public.order_delivery_details
      (order_id,business_id,delivery_address,telegram_conversation_id)
    VALUES (v_order_id,p_business_id,d.delivery_address,p_conversation_id);

    UPDATE public.telegram_order_drafts SET step='completed',order_id=v_order_id,
      last_message_id=p_message_id,updated_at=now()
    WHERE business_id=p_business_id AND conversation_id=p_conversation_id;

    RETURN jsonb_build_object('handled',true,'order_created',true,'order_id',v_order_id,
      'reply','আপনার অর্ডার অনুরোধ সংরক্ষিত হয়েছে। অর্ডার নম্বর: '||
        coalesce(v_order_number,v_order_id::text)||E'\n'||
        'স্ট্যাটাস: Pending। ব্যবসার টিম যাচাই করে সিদ্ধান্ত জানাবে।');
  END IF;

  RETURN jsonb_build_object('handled',false);
END;
$$;

REVOKE ALL ON FUNCTION public.handle_telegram_order_message(uuid,uuid,bigint,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_telegram_order_message(uuid,uuid,bigint,text)
  TO service_role;
