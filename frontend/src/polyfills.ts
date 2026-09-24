// Small polyfills for TV browsers (LG webOS runs an older Chromium, e.g. 79 on 2021 sets).
// The build targets chrome79 for syntax; these cover the few newer built-ins the code uses.

function at<T>(this: ArrayLike<T>, n: number): T | undefined {
  const i = Math.trunc(n) || 0;
  const k = i < 0 ? this.length + i : i;
  return k >= 0 && k < this.length ? this[k] : undefined;
}

for (const proto of [Array.prototype, String.prototype] as object[]) {
  if (!("at" in proto)) Object.defineProperty(proto, "at", { value: at, writable: true, configurable: true });
}

export {};
