import { useQuery } from "@tanstack/react-query";
import { data } from "@/lib/api";

// Processed data changes at most every 5 minutes (daily in practice), so cache generously.
const STALE = 5 * 60_000;

export const useHomes = () => useQuery({ queryKey: ["homes"], queryFn: data.homes, staleTime: STALE });

/** One home's tables plus the shared Ft history; `ready` once each has loaded. */
export function useDataset(home: string | null) {
  const on = home != null;
  const five = useQuery({ queryKey: ["5min", home], queryFn: () => data.fiveMin(home!), staleTime: STALE, enabled: on });
  const daily = useQuery({ queryKey: ["daily", home], queryFn: () => data.daily(home!), staleTime: STALE, enabled: on });
  const bills = useQuery({ queryKey: ["bills", home], queryFn: () => data.bills(home!), staleTime: STALE, enabled: on });
  const ft = useQuery({ queryKey: ["ft-rates"], queryFn: data.ft, staleTime: STALE });
  const all = [five, daily, bills, ft];
  return {
    ready: on && all.every((q) => q.isSuccess),
    error: all.find((q) => q.error)?.error ?? null,
    fiveMin: five.data ?? [],
    daily: daily.data ?? [],
    bills: bills.data ?? [],
    ft: ft.data ?? [],
  };
}
