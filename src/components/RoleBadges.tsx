import { useEffect, useState } from "react";
import { Shield, Code2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type AppRole = "user" | "developer" | "admin";

interface Props {
  userId: string;
  className?: string;
  size?: "sm" | "md";
}

export const RoleBadges = ({ userId, className, size = "md" }: Props) => {
  const [roles, setRoles] = useState<AppRole[]>([]);

  useEffect(() => {
    let cancelled = false;
    (supabase.rpc as any)("get_user_roles", { _user_id: userId }).then(
      ({ data, error }: { data: { role: AppRole }[] | null; error: unknown }) => {
        if (cancelled || error || !data) return;
        setRoles(data.map((r) => r.role));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const visible = roles.filter((r) => r === "admin" || r === "developer");
  if (visible.length === 0) return null;

  const sizeCls =
    size === "sm"
      ? "px-1.5 py-0.5 text-[10px] gap-1"
      : "px-2 py-0.5 text-xs gap-1.5";
  const iconCls = size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.includes("admin") && (
        <span
          className={cn(
            "inline-flex items-center rounded-full font-semibold uppercase tracking-wide border border-destructive/40 bg-destructive/15 text-destructive",
            sizeCls,
          )}
        >
          <Shield className={iconCls} />
          Admin
        </span>
      )}
      {visible.includes("developer") && (
        <span
          className={cn(
            "inline-flex items-center rounded-full font-semibold uppercase tracking-wide border border-primary/40 bg-primary/15 text-primary",
            sizeCls,
          )}
        >
          <Code2 className={iconCls} />
          Developer
        </span>
      )}
    </div>
  );
};
