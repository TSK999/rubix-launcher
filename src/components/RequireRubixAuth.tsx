import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useRubixAuth } from "@/hooks/useRubixAuth";

export const RequireRubixAuth = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { session, loading } = useRubixAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
};
