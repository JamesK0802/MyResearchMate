import { describe, expect, it, vi } from 'vitest';
import { experimentId, experimentRoute, planExperimentRoute } from './experiment-route';

describe('linear experiment route', () => {
  const graph = () => [
    {protocol_node_id:'a',protocol_next_node_ids:['b','c'],branch_selected_node_ids:[] as string[]},
    {protocol_node_id:'b',protocol_next_node_ids:['d']},
    {protocol_node_id:'c',protocol_next_node_ids:['d']},
    {protocol_node_id:'d',protocol_next_node_ids:['e','f'],branch_selected_node_ids:[] as string[]},
    {protocol_node_id:'e',protocol_next_node_ids:[]},
    {protocol_node_id:'f',protocol_next_node_ids:[]}
  ];
  it('waits at unresolved forks rather than listing all branches', () => {
    expect(experimentRoute(graph()).map(s=>s.protocol_node_id)).toEqual(['a']);
  });
  it('requires every reachable choice before creation', () => {
    const steps=graph();
    expect(planExperimentRoute(steps,{}).fork?.protocol_node_id).toBe('a');
    expect(planExperimentRoute(steps,{a:'c'}).fork?.protocol_node_id).toBe('d');
    const plan=planExperimentRoute(steps,{a:'c',d:'f'});
    expect(plan.fork).toBeUndefined();
    expect(plan.route.map(s=>s.protocol_node_id)).toEqual(['a','c','d','f']);
  });
  it('rejects cycles and broken links before saving an incomplete snapshot', () => {
    expect(()=>planExperimentRoute([{protocol_node_id:'a',protocol_next_node_ids:['a']}],{})).toThrow('loops');
    expect(()=>planExperimentRoute([{protocol_node_id:'a',protocol_next_node_ids:['missing']}],{})).toThrow('missing');
  });
  it('keeps one path through reconverging and nested forks after save/reload', () => {
    const steps=graph(); steps[0].branch_selected_node_ids=['c']; steps[3].branch_selected_node_ids=['f'];
    expect(experimentRoute(JSON.parse(JSON.stringify(steps))).map(s=>s.protocol_node_id)).toEqual(['a','c','d','f']);
  });
  it('terminates cycles without duplicating logs', () => {
    expect(experimentRoute([{protocol_node_id:'a',protocol_next_node_ids:['a']}])).toHaveLength(1);
  });
  it('creates IDs on HTTP without randomUUID', () => {
    vi.stubGlobal('crypto', {});
    try { expect(experimentId()).toMatch(/^log-/); expect(experimentId()).not.toBe(experimentId()); }
    finally {vi.unstubAllGlobals();}
  });
});
