-- Enable realtime for Demo strategy score sources so the Estratégias tab
-- updates instantly when a Demo order settles (WIN appears, LOSS removes the note).
ALTER PUBLICATION supabase_realtime ADD TABLE public.iq_demo_test_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.iq_demo_test_candidates;
