import { useCallback, useState } from "react";
import { BugKit } from "./BugKit";

export interface UseReportBugResult {
  report: (description?: string) => Promise<boolean>;
  isReporting: boolean;
  lastError: Error | null;
}

export function useReportBug(): UseReportBugResult {
  const [isReporting, setIsReporting] = useState(false);
  const [lastError, setLastError] = useState<Error | null>(null);

  const report = useCallback(async (description?: string) => {
    setIsReporting(true);
    setLastError(null);
    try {
      await BugKit.reportManually(description);
      return true;
    } catch (err) {
      setLastError(err instanceof Error ? err : new Error(String(err)));
      return false;
    } finally {
      setIsReporting(false);
    }
  }, []);

  return { report, isReporting, lastError };
}
