DO $$
DECLARE keep uuid := 'a2604ad0-5a38-4ca6-a87e-0059b909120b';
        dup  uuid := 'c2f128b6-aa02-4804-b2c9-c1b027f1d111';
BEGIN
  UPDATE public.revenue SET affiliate_id = keep WHERE affiliate_id = dup;
  UPDATE public.expenses SET affiliate_id = keep WHERE affiliate_id = dup;
  UPDATE public.withdrawals SET affiliate_id = keep WHERE affiliate_id = dup;
  UPDATE public.leads SET affiliate_id = keep WHERE affiliate_id = dup;
  UPDATE public.affiliate_events SET affiliate_id = keep WHERE affiliate_id = dup;
  UPDATE public.affiliate_guarantee_periods SET affiliate_id = keep WHERE affiliate_id = dup;
  DELETE FROM public.affiliates WHERE id = dup;
END $$;