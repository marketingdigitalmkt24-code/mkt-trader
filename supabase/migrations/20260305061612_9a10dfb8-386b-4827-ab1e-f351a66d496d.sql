ALTER TABLE public.metaapi_config 
ADD COLUMN mt5_login text DEFAULT '',
ADD COLUMN mt5_password text DEFAULT '',
ADD COLUMN mt5_server text DEFAULT '';