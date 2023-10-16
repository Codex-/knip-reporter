import * as core from "@actions/core";

interface Step<Return = any, Param = any> {
  name: string;
  action: (p: Param) => Promise<Return> | Return;
}

export interface Task {
  name: string;
  steps: Readonly<Step[]>;
}

export async function executeTask<T = void>(task: Task, initialValue?: T): Promise<T> {
  const taskMs = Date.now();
  core.info(`- Execute task ${task.name}`);

  // Pay every returned value forward
  let result: T | undefined = initialValue;
  for (const step of task.steps) {
    const stepMs = Date.now();
    core.info(`  - ${step.name}`);
    result = await step.action(result);
    core.info(`  ✔ ${step.name} (${Date.now() - stepMs}ms)`);
  }

  core.info(`✔ Execute task ${task.name} (${Date.now() - taskMs}ms)`);

  // Boldly trust that you understand the resolved value
  // of your task steps
  return result!;
}
