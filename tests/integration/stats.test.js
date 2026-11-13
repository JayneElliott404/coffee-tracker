import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createPod, registerAndLogin, setupTestDb } from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  app = createApp({ authRateLimit: 1000 });
});

describe('stats', () => {
  it('shows an empty state with no pods', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await agent.get('/stats');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Nothing rated yet.');
  });

  it("summarises only the current user's pods", async () => {
    const jayne = await registerAndLogin(app, 'jayne');
    await createPod(jayne, { name: 'Volluto', intensity: '4', score: '8.8' });
    await createPod(jayne, { name: 'Kazaar', intensity: '12', score: '7.2' });

    const other = await registerAndLogin(app, 'other');
    await createPod(other, { name: 'Other Pod', intensity: '13', score: '1' });

    const res = await jayne.get('/stats');
    const statValues = [...res.text.matchAll(/<div class="stat-value">([^<]+)/g)].map((m) => m[1].trim());
    expect(statValues).toEqual(['2', '8.0', '8.0']);
    expect(res.text).toContain('Volluto');
    expect(res.text).not.toContain('Other Pod');
    const topRated = res.text.slice(res.text.indexOf('Top rated'), res.text.indexOf('Recently tried'));
    expect(topRated.indexOf('Volluto')).toBeLessThan(topRated.indexOf('Kazaar'));
  });
});
