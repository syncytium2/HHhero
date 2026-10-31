import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { earlierVersions } from "./scripts/earlier-versions.ts";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as { version: string };

// Born = the root commit; updated = HEAD. Baked at build, never fetched: the CSP
// below forbids the page any network connection. (After gaba_excites.)
function git(cmd: string, fallback: string): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split("\n").pop() || fallback;
  } catch {
    return fallback;
  }
}
const BORN = git("git log --max-parents=0 --format=%cI", "1970-01-01T00:00:00Z");
const UPDATED = git("git log -1 --format=%cI", BORN);

// In a shallow clone --max-parents=0 returns HEAD and the Born stamp would read
// as the build time. Refuse to build instead.
function assertFullHistory(): Plugin {
  return {
    name: "assert-full-history-on-build",
    apply: "build",
    buildStart() {
      if (git("git rev-parse --is-shallow-repository", "false") === "true")
        throw new Error(`Shallow clone: the Born stamp would be wrong (got ${BORN}). Run \`git fetch --unshallow\`.`);
    },
  };
}

// The production CSP, injected into the BUILT HTML only, so the dev server's HMR
// still works. connect-src 'none': nothing this page computes can leave the machine.
const PROD_CSP =
  "default-src 'self'; connect-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'";

function injectCsp(): Plugin {
  return {
    name: "inject-csp-on-build",
    apply: "build",
    transformIndexHtml() {
      return [{ tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: PROD_CSP }, injectTo: "head-prepend" }];
    },
  };
}

export default defineConfig({
  plugins: [react(), assertFullHistory(), injectCsp()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_BORN__: JSON.stringify(BORN),
    __BUILD_UPDATED__: JSON.stringify(UPDATED),
    // the earlier releases this deploy also serves, at /v/<version>/ (scripts/deploy.sh builds them)
    __EARLIER_VERSIONS__: JSON.stringify(earlierVersions().map(({ version: v, date }) => ({ version: v, date }))),
  },
});
