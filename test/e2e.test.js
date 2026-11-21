'use strict';

// End-to-end test in a real Chromium: serves a fake yoto.io card page, runs
// both the console script and the built bookmarklet, and downloads the
// metadata file. Skipped when Playwright/Chromium is not installed.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { officialCard, trickyCard, pageHtml } = require('./fixtures/cards');
const { buildBookmarklet } = require('../scripts/build-bookmarklet');

let playwright = null;
try { playwright = require('playwright'); } catch { /* optional */ }

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'yoto-archival-downloader_v3.js'), 'utf8');

test('e2e in Chromium', { skip: playwright ? false : 'playwright is not installed' }, async (t) => {
	const pages = { '/official': pageHtml(officialCard), '/tricky': pageHtml(trickyCard) };
	const server = http.createServer((req, res) => {
		const html = pages[req.url];
		res.writeHead(html ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' });
		res.end(html || 'not found');
	});
	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	const base = `http://127.0.0.1:${server.address().port}`;
	const browser = await playwright.chromium.launch();
	t.after(async () => { await browser.close(); server.close(); });

	async function openPage(route) {
		const context = await browser.newContext({ acceptDownloads: true });
		const page = await context.newPage();
		const errors = [];
		page.on('pageerror', (err) => errors.push(err.message));
		page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
		await page.goto(base + route);
		return { page, errors, context };
	}

	await t.test('console script builds the panel and the metadata downloads', async () => {
		const { page, errors, context } = await openPage('/official');
		await page.evaluate(SCRIPT);
		const panel = page.locator('#yoto-archival-downloader');
		await panel.waitFor();
		assert.equal(await panel.locator('a.yad-track').count(), 3);
		assert.equal(await panel.locator('a.yad-icon img').count(), 3);
		assert.equal(await page.locator('[class*="Footer_appDownloadBar"]').count(), 0);
		assert.equal(await page.evaluate(() => document.body.firstElementChild.id), 'yoto-archival-downloader');

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			panel.locator('a.yad-metadata').click(),
		]);
		assert.equal(download.suggestedFilename(), 'The Big Adventure.txt');
		const file = fs.readFileSync(await download.path(), 'utf8');
		assert.equal(file, await panel.locator('textarea').inputValue());
		assert.match(file, /ReadableDuration:: 1h 2m 5s/);
		assert.match(file, /TrackNumber:: 003/);

		// running a second time must not throw "already declared"
		await page.evaluate(SCRIPT);
		assert.equal(await page.locator('#yoto-archival-downloader').count(), 1);
		assert.deepEqual(errors, []);
		await context.close();
	});

	await t.test('copy button copies the metadata', async () => {
		const { page, errors, context } = await openPage('/official');
		await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
		await page.evaluate(SCRIPT);
		const button = page.locator('button.yad-copy');
		await button.click();
		await page.waitForFunction(() => document.querySelector('button.yad-copy').textContent === 'Copied!');
		const clip = await page.evaluate(() => navigator.clipboard.readText());
		assert.equal(clip, await page.locator('#yoto-archival-downloader textarea').inputValue());
		assert.deepEqual(errors, []);
		await context.close();
	});

	await t.test('minified bookmarklet works on a card with tricky titles', async () => {
		const bookmarklet = await buildBookmarklet();
		assert.ok(bookmarklet.startsWith('javascript:'));
		const { page, errors, context } = await openPage('/tricky');
		await page.evaluate(decodeURIComponent(bookmarklet.slice('javascript:'.length)));
		const panel = page.locator('#yoto-archival-downloader');
		await panel.waitFor();
		assert.equal(await panel.locator('script').count(), 0);
		assert.equal(await panel.locator('tr[data-track]').count(), 2);
		const name = await panel.locator('a.yad-track').first().textContent();
		assert.equal(name, `Peter's _Best_ _Songs__ Vol_1_ - 001 - It's _script_alert(1)__script_ time`);

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			panel.locator('a.yad-metadata').click(),
		]);
		assert.equal(download.suggestedFilename(), `Peter's _Best_ _Songs__ Vol_1_.txt`);
		assert.deepEqual(errors, []);
		const outDir = path.join(__dirname, '..', 'test-results');
		fs.mkdirSync(outDir, { recursive: true });
		await page.screenshot({ path: path.join(outDir, 'tricky-card.png'), fullPage: true });
		await context.close();
	});
});
