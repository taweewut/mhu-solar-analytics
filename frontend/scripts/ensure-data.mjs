// Before dev/build: if public/data has no homes.json (a fresh clone — real data is
// git-ignored), seed it with the synthetic sample_data/ so the dashboard has something to show.
// scripts/refresh_all.sh overwrites it with your own data.
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const data = fileURLToPath(new URL("../public/data/", import.meta.url));
const sample = fileURLToPath(new URL("../../sample_data/", import.meta.url));

if (!existsSync(`${data}homes.json`)) {
  cpSync(sample, data, { recursive: true });
  console.log("public/data was empty: copied the sample dataset (sample_data/).");
}
