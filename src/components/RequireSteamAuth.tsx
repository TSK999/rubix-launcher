import { Navigate, useLocation } from "react-router-dom";
import { getStoredSteamId } from "@/lib/steam-auth";

export const RequireSteamAuth = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const steamId = getStoredSteamId();
  if (!steamId) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
};
