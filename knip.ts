import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: ["dist/**"],
  // Both used in eslint.config.mjs
  ignoreDependencies: ["eslint-import-resolver-typescript"],
};

export default config;
