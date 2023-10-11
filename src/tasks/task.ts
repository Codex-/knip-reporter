import * as core from "@actions/core";

interface Step<Return = any, Param = any> {
  name: string;
  action: (p: Param) => Promise<Return> | Return;
}

export interface Task {
  name: string;
  steps: Readonly<Step[]>;
}

export async function executeTask(task: Task): Promise<void> {
  const taskMs = Date.now();
  core.info(`- Execute task ${task.name}`);

  // Pay every returned value forward
  let result: unknown = undefined;
  for (const step of task.steps) {
    const stepMs = Date.now();
    core.info(`  - ${step.name}`);
    result = await step.action(result);
    core.info(`  ✔ ${step.name} (${Date.now() - stepMs}ms)`);
  }

  core.info(`✔ Execute task ${task.name} (${Date.now() - taskMs}ms)`);
}
