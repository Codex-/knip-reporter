import * as core from "@actions/core";

export async function timeTask<R>(name: string, task: () => R | Promise<R>): Promise<R> {
  const stepMs = Date.now();
  core.info(`  - ${name}`);
  const result = await task();
  core.info(`  ✔ ${name} (${Date.now() - stepMs}ms)`);
  return result;
}
