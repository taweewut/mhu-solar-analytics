import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsProvider } from "@/lib/settings";
import { ThemeProvider } from "@/lib/theme";
import { TrendModeProvider } from "@/lib/trendMode";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <SettingsProvider>
          <TrendModeProvider>{children}</TrendModeProvider>
        </SettingsProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
