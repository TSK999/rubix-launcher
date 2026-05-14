REVOKE EXECUTE ON FUNCTION public.get_friend_presence(uuid[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_friend_presence(uuid[]) TO authenticated;