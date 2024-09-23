import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignore: ["dist/**"],
  // Both used in eslint.config.mjs
  ignoreDependencies: ["eslint-plugin-github", "eslint-plugin-import"],
};

export default config;
