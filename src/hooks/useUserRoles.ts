import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRubixAuth } from "./useRubixAuth";

export type AppRole = "user" | "developer" | "admin";

export const useUserRoles = () => {
  const { user } = useRubixAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) setRoles(data.map((r) => r.role as AppRole));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return {
    roles,
    loading,
    isAdmin: roles.includes("admin"),
    isDeveloper: roles.includes("developer") || roles.includes("admin"),
  };
};
