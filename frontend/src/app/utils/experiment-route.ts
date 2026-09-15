export interface RouteStep {
  protocol_node_id?: string;
  protocol_next_node_ids?: string[];
  branch_selected_node_ids?: string[];
}

export function planExperimentRoute<T extends RouteStep>(steps:T[], choices:Record<string,string>) {
  const byId = new Map(steps.map(step => [step.protocol_node_id, step]));
  const route:T[] = [];
  const visited = new Set<T>();
  let step:T | undefined = steps[0];
  while (step) {
    if (visited.has(step)) throw new Error('This path loops back to an earlier step. Choose a different path.');
    visited.add(step); route.push(step);
    const ids: string[] = [...new Set(step.protocol_next_node_ids || [])];
    if (ids.some(id => !byId.has(id))) throw new Error('This protocol contains a missing linked step. Repair the Tree Protocol before creating a log.');
    const options = ids.map(id=>byId.get(id)!);
    if (ids.length > 1 && !ids.includes(choices[step.protocol_node_id || ''])) return {route, fork:step, options};
    const next: string | undefined = ids.length > 1 ? choices[step.protocol_node_id || ''] : ids[0];
    step = next ? byId.get(next) : undefined;
  }
  return {route, fork:undefined, options:[] as T[]};
}

/** Follow one chosen edge at each fork; never flatten sibling branches into a run. */
export function experimentRoute<T extends RouteStep>(steps: T[]): T[] {
  const byId = new Map(steps.map(step => [step.protocol_node_id, step]));
  const visited = new Set<T>();
  const route: T[] = [];
  let step: T | undefined = steps[0];
  while (step && !visited.has(step)) {
    route.push(step); visited.add(step);
    const options: string[] = [...new Set(step.protocol_next_node_ids || [])];
    const chosen: string | undefined = options.length > 1
      ? step.branch_selected_node_ids?.find(id => options.includes(id)) : options[0];
    step = chosen ? byId.get(chosen) : undefined;
  }
  return route;
}

/** Log IDs must also work on HTTP deployments where randomUUID is unavailable. */
export function experimentId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
