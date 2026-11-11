import { fetcher } from "@/lib/fetcher";

// Share a small queue across the visible page's loaders, keeping each result independent.
const pending: Array<{ url: string; resolve: (value: unknown) => void; reject: (error: unknown) => void }> = [];
let active = 0;
function drain() {
  while (active < 3 && pending.length) {
    const job = pending.shift()!;
    active++;
    Promise.resolve().then(() => fetcher(job.url)).then(job.resolve, job.reject).finally(() => { active--; drain(); });
  }
}
export function fetchProjectHealth(url: string) {
  return new Promise((resolve, reject) => { pending.push({ url, resolve, reject }); drain(); });
}
