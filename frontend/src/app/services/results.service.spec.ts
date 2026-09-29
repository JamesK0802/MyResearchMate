import '@angular/compiler';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ResultsService } from './results.service';

describe('ResultsService fresh reads', () => {
  it('waits for authentication and bypasses cached All Data responses', async () => {
    const http = { get: vi.fn().mockReturnValue(of([])) };
    const auth = {
      loading$: of(false),
      getSession: vi.fn().mockResolvedValue({ access_token: 'token' }),
    };
    const service = new ResultsService(http as any, auth as any);

    await service.getAllResults();

    const [url, options] = http.get.mock.calls[0];
    expect(url).toMatch(/\/crispr-results\/all\?_\=\d+$/);
    expect(options.headers.get('Authorization')).toBe('Bearer token');
    expect(options.headers.get('Cache-Control')).toBe('no-cache');
  });
});
