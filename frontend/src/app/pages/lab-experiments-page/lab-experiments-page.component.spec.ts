import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { LabExperimentsPageComponent } from './lab-experiments-page.component';

describe('experiment creation snapshot', () => {
  it('saves a memo on its node without modifying protocol steps', () => {
    const notebook = {updateExperiment:vi.fn().mockResolvedValue({})};
    const page = new LabExperimentsPageComponent(notebook as any, {} as any, {} as any, {detectChanges(){}} as any, {} as any);
    page.selectedExperiment={id:'run',title:'Run',steps:[{id:'snapshot',title:'Original step'}],run_memos:[]};
    page.memoText='Observed a colour change';
    page.addMemo();
    expect(notebook.updateExperiment).toHaveBeenCalledWith('run',expect.objectContaining({
      run_memos:[expect.objectContaining({node_id:'snapshot',text:'Observed a colour change'})],
      steps:[{id:'snapshot',title:'Original step'}]
    }));
    expect(page.memoComposerOpen).toBe(false);
  });
  it('preserves existing individual shares when lab sharing changes', async () => {
    const notebook={getWorkflowShares:vi.fn().mockResolvedValue({lab_ids:['lab-1'],user_ids:['42']}), updateWorkflowShares:vi.fn().mockResolvedValue({})};
    const page=new LabExperimentsPageComponent(notebook as any,{} as any,{} as any,{detectChanges(){}} as any,{getMyLabs:vi.fn().mockResolvedValue([{id:'lab-1'},{id:'lab-2'}])} as any);
    page.loadExperiments=vi.fn().mockResolvedValue(undefined);
    await page.openSharing({id:'run'});
    page.toggleSharingLab('lab-2');
    await page.saveSharing();
    expect(notebook.updateWorkflowShares).toHaveBeenCalledWith('run','active',['lab-1','lab-2'],['42']);
    expect(page.loadExperiments).toHaveBeenCalled();
  });
  it('shows owner and shared state for an experiment shared with a lab', () => {
    const page=new LabExperimentsPageComponent({} as any,{} as any,{} as any,{detectChanges(){}} as any,{} as any);
    const experiment={shared_lab_ids:['lab-1'],shared_labs:["Nicole's Lab"]};
    expect(page.isExperimentShared(experiment)).toBe(true);
    expect(page.cardBadges(experiment)).toEqual([
      {label:'OWNER',tone:'owner'},
      {label:'SHARED',tone:'shared'}
    ]);
    expect(page.sharingSummary(experiment)).toBe("Shared with: Nicole's Lab");
  });
  it('does not create until paths are chosen and does not share content with the source tree', async () => {
    const notebook = { createExperiment:vi.fn().mockResolvedValue({}) };
    const page = new LabExperimentsPageComponent(notebook as any, {} as any, {} as any, {detectChanges(){}} as any, {} as any);
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
