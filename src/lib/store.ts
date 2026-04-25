export const formatPrice = (cents: number): string => {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
};

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

export const AGE_RATINGS = ["E", "E10", "T", "M", "A"] as const;
export const PLATFORMS = ["windows", "mac", "linux"] as const;

export type GameStatus = "draft" | "pending" | "approved" | "rejected";
export type AppStatus = "pending" | "approved" | "rejected";

export const statusBadgeVariant = (
  status: string
): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "approved":
      return "default";
    case "pending":
      return "secondary";
    case "rejected":
      return "destructive";
    default:
      return "outline";
  }
};
