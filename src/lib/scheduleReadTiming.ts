export function createScheduleReadTiming() {
  const started = performance.now();
  const metrics: string[] = [];

  return {
    async measure<T>(name: string, read: () => Promise<T>) {
      const readStarted = performance.now();
      try {
        return await read();
      } finally {
        metrics.push(`${name};dur=${(performance.now() - readStarted).toFixed(2)}`);
      }
    },
    finish(response: Response, responseStarted: number, source: "none" | "supabase" | "sheets" | "sheets_fallback") {
      const finished = performance.now();
      response.headers.set("Server-Timing", [
        ...metrics,
        `prepare;dur=${(finished - responseStarted).toFixed(2)}`,
        `total;dur=${(finished - started).toFixed(2)}`,
        `source;desc="${source}"`,
      ].join(", "));
      return response;
    },
  };
}
