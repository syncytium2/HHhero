/** Baked in at build from package.json and git (vite.config.ts): nothing is fetched at runtime. */
export const VERSION: string = __APP_VERSION__;
/** The root commit's time: when HHhero was born. */
export const BORN: string = __BUILD_BORN__;
export const UPDATED: string = __BUILD_UPDATED__;
/** The earlier releases served beside this one, each at /v/<version>/, newest first. */
export const EARLIER: { version: string; date: string }[] = __EARLIER_VERSIONS__;
/** On the dev site (scripts/deploy.sh --dev), the branch and commit it was built from; empty everywhere else. */
export const DEV_SITE: string = __DEV_SITE__;
/** True when this build is one of those earlier versions, served under /v/. */
export const ARCHIVED: boolean = import.meta.env.BASE_URL.startsWith("/v/");
