import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { LabExperimentsPageComponent } from './lab-experiments-page.component';

describe('experiment creation snapshot', () => {
  it('saves a run-level memo without modifying protocol steps', () => {
    const notebook = {updateExperiment:vi.fn().mockResolvedValue({})};
    const page = new LabExperimentsPageComponent(notebook as any, {} as any, {} as any, {detectChanges(){}} as any);
    page.selectedExperiment={id:'run',title:'Run',steps:[{id:'snapshot',title:'Original step'}],run_memos:[]};
    page.memoText='Observed a colour change';
    page.addMemo();
    expect(notebook.updateExperiment).toHaveBeenCalledWith('run',expect.objectContaining({
      run_memos:[expect.objectContaining({text:'Observed a colour change'})],
      steps:[{id:'snapshot',title:'Original step'}]
    }));
    expect(page.memoComposerOpen).toBe(false);
  });
  it('does not create until paths are chosen and does not share content with the source tree', async () => {
    const notebook = { createExperiment:vi.fn().mockResolvedValue({}) };
    const page = new LabExperimentsPageComponent(notebook as any, {} as any, {} as any, {detectChanges(){}} as any);
    page.loadExperiments = vi.fn().mockResolvedValue(undefined);
    const record = (page as any).demoProtocol();
    page.protocols=[record];
    page.createForm.protocolId=record.id;
    page.onProtocolSelected();
    await page.createExperiment();
    expect(notebook.createExperiment).not.toHaveBeenCalled();
    expect(page.creationOptions.map(s=>s.title)).toEqual(['Standard treatment','Recovery treatment']);
    page.creationChoice='demo-4';
    await page.chooseCreationPath();
    const payload=notebook.createExperiment.mock.calls[0][0];
    expect(payload.steps.map((s:any)=>s.protocol_node_id)).toEqual(['demo-1','demo-2','demo-4','demo-5']);
    record.document_json.trees[0].nodes[0].title='Changed later';
    record.document_json.trees[0].nodes[0].steps[0]='Changed instruction';
    expect(payload.steps[0].title).toBe('Prepare samples');
    expect(payload.steps[0].instructions[0]).toBe('Confirm sample IDs');
    expect(payload.steps[0].node_snapshot.title).toBe('Prepare samples');
  });
});
