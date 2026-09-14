export interface RouteStep {
  protocol_node_id?: string;
  protocol_next_node_ids?: string[];
  branch_selected_node_ids?: string[];
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
