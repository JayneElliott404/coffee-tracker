import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Pod } from '../../src/models/Pod.js';
import { User } from '../../src/models/User.js';
import { createPod, PASSWORD, registerAndLogin, setupTestDb, submit } from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  app = createApp({ authRateLimit: 1000 });
});

describe('pods', () => {
  it('adds a pod with a decimal score', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await createPod(agent, { name: 'Vanilla Eclair', score: '7.25', dateTried: '2026-11-01' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/pods');

    const pod = await Pod.findOne({ name: 'Vanilla Eclair' });
    expect(pod.score).toBe(7.3);
    expect(pod.intensity).toBe(9);
    expect(pod.dateTried.toISOString()).toBe('2026-11-01T00:00:00.000Z');

    const page = await agent.get('/pods');
    expect(page.text).toContain('Vanilla Eclair');
    expect(page.text).toContain('7.3');
    expect(page.text).toContain('Added Vanilla Eclair.');
  });

  it('re-shows the form with errors and keeps the input', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await createPod(agent, { name: 'Kazaar', intensity: '14', score: '10.1' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Intensity must be a whole number from 1 to 13');
    expect(res.text).toContain('Score must be a number from 0 to 10');
    expect(res.text).toContain('value="Kazaar"');
    expect(await Pod.countDocuments()).toBe(0);
  });

  it('escapes user content in the page', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await createPod(agent, { name: '<script>alert(1)</script>' });
    const page = await agent.get('/pods');
    expect(page.text).not.toContain('<script>alert(1)</script>');
    expect(page.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('edits a pod', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await createPod(agent);
    const pod = await Pod.findOne();

    expect((await agent.get(`/pods/${pod._id}/edit`)).status).toBe(200);
    const res = await submit(agent, `/pods/${pod._id}`, { name: 'Arpeggio Decaf', intensity: '9', score: '9.1', flavour: 'Cocoa', notes: 'Better with milk' });
    expect(res.status).toBe(302);

    const updated = await Pod.findById(pod._id);
    expect(updated.name).toBe('Arpeggio Decaf');
    expect(updated.score).toBe(9.1);
    expect(updated.notes).toBe('Better with milk');
  });

  it('saves and shows the brand, with the brand input before the name input', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const form = await agent.get('/pods/new');
    expect(form.text.indexOf('name="brand"')).toBeGreaterThan(-1);
    expect(form.text.indexOf('name="brand"')).toBeLessThan(form.text.indexOf('name="name"'));

    await createPod(agent, { name: 'Volluto', brand: '  Nespresso ' });
    expect((await Pod.findOne()).brand).toBe('Nespresso');
    expect((await agent.get('/pods')).text).toContain('Nespresso');
  });

  it('lets a pod saved before brands existed be viewed and given a brand', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const user = await User.findOne({ username: 'jayne@example.com' });
    const { insertedId } = await Pod.collection.insertOne({ user: user._id, name: 'Legacy', intensity: 5, score: 7 });

    expect((await agent.get('/pods')).text).toContain('Legacy');
    expect((await agent.get(`/pods/${insertedId}/edit`)).status).toBe(200);

    const res = await submit(agent, `/pods/${insertedId}`, { name: 'Legacy', intensity: '5', score: '7', brand: 'Starbucks' });
    expect(res.status).toBe(302);
    const updated = await Pod.findById(insertedId);
    expect(updated.brand).toBe('Starbucks');
    expect(updated.name).toBe('Legacy');
  });

  it('defaults new pods to the account machine, lets it be overridden, and can update it later', async () => {
    const agent = await registerAndLogin(app, 'jayne', PASSWORD, 'vertuo');
    await createPod(agent, { name: 'Default one' });
    await createPod(agent, { name: 'Override one', machineType: 'original' });
    expect((await Pod.findOne({ name: 'Default one' })).machineType).toBe('vertuo');
    const override = await Pod.findOne({ name: 'Override one' });
    expect(override.machineType).toBe('original');

    const form = (await agent.get(`/pods/${override._id}/edit`)).text;
    expect(form).toMatch(/value="original" autocomplete="off" checked/);

    const res = await submit(agent, `/pods/${override._id}`, { name: 'Override one', intensity: '9', score: '8', machineType: 'vertuo' });
    expect(res.status).toBe(302);
    expect((await Pod.findById(override._id)).machineType).toBe('vertuo');
    expect((await agent.get('/pods')).text).toContain('Vertuo');
  });

  it('rejects an unknown machine on a pod', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await createPod(agent, { machineType: 'moka' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose Original or Vertuo');
    expect(await Pod.countDocuments()).toBe(0);
  });

  it('shows pods saved before machine types existed as Original and keeps that when edited without a machine', async () => {
    const agent = await registerAndLogin(app, 'jayne', PASSWORD, 'vertuo');
    const user = await User.findOne({ username: 'jayne@example.com' });
    const { insertedId } = await Pod.collection.insertOne({ user: user._id, name: 'Legacy', intensity: 5, score: 7 });

    expect((await agent.get('/pods')).text).toContain('Original');
    expect((await agent.get(`/pods/${insertedId}/edit`)).text).toMatch(/value="original" autocomplete="off" checked/);

    await submit(agent, `/pods/${insertedId}`, { name: 'Legacy', intensity: '5', score: '7' });
    expect((await Pod.collection.findOne({ _id: insertedId })).machineType).toBe('original');
    await submit(agent, `/pods/${insertedId}`, { name: 'Legacy', intensity: '5', score: '7', machineType: 'vertuo' });
    expect((await Pod.findById(insertedId)).machineType).toBe('vertuo');
  });

  it('shows validation errors when editing', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await createPod(agent);
    const pod = await Pod.findOne();
    const res = await submit(agent, `/pods/${pod._id}`, { name: '', intensity: '9', score: '9' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter the pod name');
  });

  it('deletes a pod', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await createPod(agent);
    const pod = await Pod.findOne();
    const res = await submit(agent, `/pods/${pod._id}/delete`);
    expect(res.status).toBe(302);
    expect(await Pod.countDocuments()).toBe(0);
  });

  it("never lets a user see or change another user's pod", async () => {
    const owner = await registerAndLogin(app, 'owner');
    await createPod(owner, { name: 'Secret Blend' });
    const pod = await Pod.findOne();
    const intruder = await registerAndLogin(app, 'intruder');

    expect((await intruder.get('/pods')).text).not.toContain('Secret Blend');
    expect((await intruder.get(`/pods/${pod._id}/edit`)).status).toBe(404);
    expect((await submit(intruder, `/pods/${pod._id}`, { name: 'Hacked', intensity: '1', score: '0' })).status).toBe(404);
    expect((await submit(intruder, `/pods/${pod._id}/delete`)).status).toBe(404);
    expect((await Pod.findById(pod._id)).name).toBe('Secret Blend');
  });

  it('returns 404 for malformed pod ids', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    expect((await agent.get('/pods/not-an-id/edit')).status).toBe(404);
  });

  it('searches, filters and sorts', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await createPod(agent, { name: 'Ristretto', brand: 'Nespresso', intensity: '10', score: '6.5', flavour: 'Intense, roasted' });
    await createPod(agent, { name: 'Volluto', brand: 'Starbucks', intensity: '4', score: '8.8', flavour: 'Sweet biscuit' });
    await createPod(agent, { name: 'Kazaar', intensity: '12', score: '7.2', flavour: 'Peppery' });

    const names = (text) => [...text.matchAll(/<h2 class="h5 card-title mb-0">([^<]+)<\/h2>/g)].map((m) => m[1]);

    const page = (await agent.get('/pods')).text;
    expect(page.indexOf('name="brand"')).toBeLessThan(page.indexOf('name="q"'));
    expect(names((await agent.get('/pods?brand=STAR')).text)).toEqual(['Volluto']);
    expect(names((await agent.get('/pods?q=VOLL')).text)).toEqual(['Volluto']);
    expect(names((await agent.get('/pods?flavour=roast')).text)).toEqual(['Ristretto']);
    expect(names((await agent.get('/pods?minIntensity=10&sort=intensity_asc')).text)).toEqual(['Ristretto', 'Kazaar']);
    expect(names((await agent.get('/pods?sort=score_desc')).text)).toEqual(['Volluto', 'Kazaar', 'Ristretto']);
    expect(names((await agent.get('/pods?sort=name')).text)).toEqual(['Kazaar', 'Ristretto', 'Volluto']);

    const bogus = await agent.get('/pods?sort=%24where');
    expect(bogus.status).toBe(200);
    expect(names(bogus.text)).toHaveLength(3);
  });
});
