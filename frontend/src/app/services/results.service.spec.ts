import '@angular/compiler';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ResultsService } from './results.service';

describe('ResultsService fresh reads', () => {
  it('builds All Data from fresh My Data and Shared with Me responses', async () => {
    const mine = { id: 'mine', created_at: '2026-09-28T00:00:00Z' };
    const shared = { id: 'shared', created_at: '2026-09-29T00:00:00Z' };
    const http = { get: vi.fn((url: string) => of(url.includes('/my?') ? [mine] : [shared])) };
    const auth = {
      loading$: of(false),
      getSession: vi.fn().mockResolvedValue({ access_token: 'token' }),
    };
    const service = new ResultsService(http as any, auth as any);

    const results = await service.getAllResults();

    expect(results.map(result => result.id)).toEqual(['shared', 'mine']);
    expect(http.get).toHaveBeenCalledTimes(2);
    for (const [url, options] of http.get.mock.calls) {
      expect(url).toMatch(/\/crispr-results\/(my|shared)\?_\=\d+$/);
      expect(options.headers.get('Authorization')).toBe('Bearer token');
      expect(options.headers.get('Cache-Control')).toBe('no-cache');
    }
  });
});
