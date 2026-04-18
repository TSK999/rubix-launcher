import { supabase } from "@/integrations/supabase/client";

export type RawgResult = {
  rawgId: number;
  title: string;
  released?: string;
  cover?: string;
  genre?: string;
  developer?: string;
  description?: string;
};

export const searchRawg = async (
  query: string,
  pageSize = 6,
): Promise<RawgResult[]> => {
  const { data, error } = await supabase.functions.invoke("rawg-search", {
    body: { query, pageSize },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return (data?.results as RawgResult[]) ?? [];
};
