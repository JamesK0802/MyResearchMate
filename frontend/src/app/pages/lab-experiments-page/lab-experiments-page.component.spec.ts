import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { LabExperimentsPageComponent } from './lab-experiments-page.component';

describe('experiment creation snapshot', () => {
  it('opens experiment logs on their own routed page', () => {
    const router={navigate:vi.fn()};
    const page = new LabExperimentsPageComponent({} as any, {} as any, {} as any, {detectChanges(){}} as any, {} as any, router as any, {snapshot:{paramMap:{get:()=>null}}} as any);
    page.openExperiment({id:'run-1'});
    expect(router.navigate).toHaveBeenCalledWith(['/data/experiment-logs','run-1']);
  });
  it('saves a memo on its node without modifying protocol steps', () => {
    const notebook = {updateExperiment:vi.fn().mockResolvedValue({})};
    const page = new LabExperimentsPageComponent(notebook as any, {} as any, {} as any, {detectChanges(){}} as any, {} as any, {navigate:vi.fn()} as any, {snapshot:{paramMap:{get:()=>null}}} as any);
    page.selectedExperiment={id:'run',title:'Run',steps:[{id:'snapshot',title:'Original step'}],run_memos:[]};
    page.memoText='Observed a colour change';
    page.addMemo();
    expect(notebook.updateExperiment).toHaveBeenCalledWith('run',expect.objectContaining({
      run_memos:[expect.objectContaining({node_id:'snapshot',text:'Observed a colour change'})],
      steps:[{id:'snapshot',title:'Original step'}]
    }));
    expect(page.memoComposerOpen).toBe(false);
  });
  it('edits a stage note as one free-form note and preserves status logs', () => {
    const page = new LabExperimentsPageComponent({updateExperiment:vi.fn().mockResolvedValue({})} as any, {} as any, {} as any, {detectChanges(){}} as any, {} as any, {navigate:vi.fn()} as any, {snapshot:{paramMap:{get:()=>null}}} as any);
    const step:any={id:'step-1',title:'Step',logs:[{id:'status',kind:'status',text:'Started'},{id:'old',text:'Old note'}],comments:['Earlier comment']};
    page.selectedExperiment={id:'run',title:'Run',steps:[step],run_memos:[]};
    expect(page.stageNote(page.selectedExperiment,step)).toBe('Old note\n\nEarlier comment');
    page.updateStageNote(step,'Edited freely');
    expect(page.selectedExperiment.run_memos).toEqual([expect.objectContaining({node_id:'step-1',text:'Edited freely'})]);
    expect(step.logs).toEqual([{id:'status',kind:'status',text:'Started'}]);
    expect(step.comments).toEqual([]);
  });
  it('preserves existing individual shares when lab sharing changes', async () => {
    const notebook={getWorkflowShares:vi.fn().mockResolvedValue({lab_ids:['lab-1'],user_ids:['42']}), updateWorkflowShares:vi.fn().mockResolvedValue({})};
    const page=new LabExperimentsPageComponent(notebook as any,{} as any,{} as any,{detectChanges(){}} as any,{getMyLabs:vi.fn().mockResolvedValue([{id:'lab-1'},{id:'lab-2'}]),getAllUsers:vi.fn().mockResolvedValue([{id:'42',name:'A user'}])} as any,{navigate:vi.fn()} as any,{snapshot:{paramMap:{get:()=>null}}} as any);
    page.loadExperiments=vi.fn().mockResolvedValue(undefined);
    await page.openSharing({id:'run'});
    page.changeSharingAccess({kind:'labs',id:'lab-2',permission:'view',checked:true});
    await page.saveSharing();
    expect(notebook.updateWorkflowShares).toHaveBeenCalledWith('run','active',['lab-1','lab-2'],[],['42'],[]);
    expect(page.loadExperiments).toHaveBeenCalled();
  });
  it('keeps edit dependent on view', () => {
    const page=new LabExperimentsPageComponent({} as any,{} as any,{} as any,{detectChanges(){}} as any,{} as any,{navigate:vi.fn()} as any,{snapshot:{paramMap:{get:()=>null}}} as any);
    page.sharingLabIds=['lab-1'];
    page.changeSharingAccess({kind:'labs',id:'lab-1',permission:'edit',checked:true});
    expect(page.sharingLabIds).toEqual(['lab-1']);
    expect(page.sharingEditLabIds).toEqual(['lab-1']);
    page.changeSharingAccess({kind:'labs',id:'lab-1',permission:'view',checked:false});
    expect(page.sharingLabIds).toEqual([]);
    expect(page.sharingEditLabIds).toEqual([]);
  });
  it('shows owner and shared state for an experiment shared with a lab', () => {
    const page=new LabExperimentsPageComponent({} as any,{} as any,{} as any,{detectChanges(){}} as any,{} as any,{navigate:vi.fn()} as any,{snapshot:{paramMap:{get:()=>null}}} as any);
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
    const page = new LabExperimentsPageComponent(notebook as any, {} as any, {} as any, {detectChanges(){}} as any, {} as any, {navigate:vi.fn()} as any, {snapshot:{paramMap:{get:()=>null}}} as any);
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
