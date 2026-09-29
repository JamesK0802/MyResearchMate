import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { MyDataComponent } from './my-data.component';

describe('My Data initial loading', () => {
  it('publishes fetched rows immediately without requiring a tab change', async () => {
    const row:any={id:'result-1',owner_user_id:1,title:'Loaded immediately',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),metadata_json:{},result_json:{}};
    const results={getAllResults:vi.fn().mockResolvedValue([row])};
    const appRef={tick:vi.fn()};
    const cdr={detectChanges:vi.fn(),markForCheck:vi.fn()};
    const zone={run:(callback:()=>unknown)=>callback()};
    const page=new MyDataComponent(results as any,{} as any,{} as any,{} as any,{} as any,{isDemo:false,currentProfile:{id:1}} as any,{} as any,{} as any,appRef as any,cdr as any,zone as any,{} as any,{destroyed:false,onDestroy(){}} as any);

    await page.loadData();
    await Promise.resolve();

    expect(page.loading).toBe(false);
    expect(page.displayResults).toEqual([row]);
    expect(cdr.detectChanges).toHaveBeenCalled();
    expect(cdr.markForCheck).toHaveBeenCalled();
    expect(appRef.tick).toHaveBeenCalled();
  });
});
