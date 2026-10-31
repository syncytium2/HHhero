// The earlier releases a deploy also serves, each at /v/<version>/ so a user
// can go back to one: the KEEP most recent "Release v…" commits other than the
// current version. One list for both the build (the About dialog's links,
// through vite.config.ts) and the deploy (which builds them), so they agree.
//   node scripts/earlier-versions.ts      # prints "version commit date" lines
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const KEEP = 2;

export interface Earlier {
  version: string;
  commit: string;
  /** the release commit's date, YYYY-MM-DD */
  date: string;
}

export function earlierVersions(cwd: string = process.cwd(), keep: number = KEEP): Earlier[] {
  const { version } = JSON.parse(readFileSync(resolve(cwd, "package.json"), "utf8")) as { version: string };
  let log = "";
  try {
    log = execFileSync("git", ["log", "--grep=^Release v", "--format=%h%x09%cI%x09%s"], { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return [];
  }
  const out: Earlier[] = [];
  for (const line of log.split("\n")) {
    const [commit, iso, subject] = line.split("\t");
    const v = /^Release v(\S+)$/.exec(subject ?? "")?.[1];
    if (!v || v === version || out.some((e) => e.version === v)) continue;
    out.push({ version: v, commit, date: iso.slice(0, 10) });
    if (out.length === keep) break;
  }
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const e of earlierVersions()) console.log(`${e.version} ${e.commit} ${e.date}`);
}
