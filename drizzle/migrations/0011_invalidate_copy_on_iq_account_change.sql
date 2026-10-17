CREATE OR REPLACE FUNCTION public.invalidate_copy_on_iq_account_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
    NEW.is_active := false;
    NEW.last_connected_at := NULL;
  END IF;
  IF NEW.account_type IS DISTINCT FROM OLD.account_type OR NOT NEW.is_active OR NEW.last_connected_at IS NULL THEN
    UPDATE public.copy_trading_configs SET enabled = false WHERE user_id = NEW.user_id AND enabled;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_copy_on_iq_account_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER invalidate_copy_on_iq_account_change BEFORE UPDATE ON public.iqoption_config FOR EACH ROW EXECUTE FUNCTION public.invalidate_copy_on_iq_account_change();