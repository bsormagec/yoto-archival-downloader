'use strict';

// Runs the script the same way a user does (pasting it into the page) inside
// jsdom, then checks the panel it builds.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { officialCard, myoCard, trickyCard, realShapeMyoCard, pageHtml } = require('./fixtures/cards');

const SCRIPT = fs.readFileSync(path.join(__dirname, '..', 'yoto-archival-downloader_v3.js'), 'utf8');

function loadPage(html) {
	const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://yoto.io/abc12' });
	const { window } = dom;
	const blobs = new Map();
	let counter = 0;
	window.URL.createObjectURL = (blob) => { const url = `blob:test/${++counter}`; blobs.set(url, blob); return url; };
	window.URL.revokeObjectURL = (url) => { blobs.delete(url); };
	const errors = [];
	window.console.error = (...args) => errors.push(args.join(' '));
	const paste = () => window.eval(SCRIPT);
	return { window, document: window.document, blobs, errors, paste };
}

const panel = (document) => document.getElementById('yoto-archival-downloader');
// jsdom's Blob has no .text(), so read it with the page's FileReader
const blobText = (window, blob) => new Promise((resolve, reject) => {
	const reader = new window.FileReader();
	reader.onload = () => resolve(reader.result);
	reader.onerror = reject;
	reader.readAsText(blob);
});

test('official card: builds the panel with every track, icon, cover and metadata', async () => {
	const page = loadPage(pageHtml(officialCard));
	page.paste();
	const root = panel(page.document);
	assert.ok(root, 'panel inserted');
	assert.equal(page.document.body.firstElementChild, root, 'panel is first in body');
	assert.deepEqual(page.errors, []);

	const trackLinks = [...root.querySelectorAll('a.yad-track')];
	assert.deepEqual(trackLinks.map((a) => a.textContent), [
		'The Big Adventure - 001 - Chapter One.mp3',
		'The Big Adventure - 002 - Chapter One (part 2).mp3',
		'The Big Adventure - 003 - Chapter Two.aac',
	]);
	assert.deepEqual(trackLinks.map((a) => a.href), [
		'https://cdn.example.test/audio/1.mp3',
		'https://cdn.example.test/audio/2.mp3',
		'https://cdn.example.test/audio/3.mp3',
	]);
	trackLinks.forEach((a) => { assert.equal(a.target, '_blank'); assert.equal(a.title, a.textContent); });

	const iconLinks = [...root.querySelectorAll('a.yad-icon')];
	assert.equal(iconLinks.length, 3);
	assert.equal(iconLinks[0].title, 'The Big Adventure - 001 - Chapter One (icon).png');
	assert.equal(iconLinks[2].querySelector('img').src, 'https://cdn.example.test/icons/track3.png');

	const cover = root.querySelector('a.yad-cover');
	assert.equal(cover.href, 'https://cdn.example.test/covers/big-adventure.jpg');
	assert.equal(cover.textContent, 'The Big Adventure - Artwork.jpg');
	assert.match(root.querySelector('.yad-card-info span').textContent, /^The Big Adventure \(by Jane Writer\)$/);
	assert.match(root.textContent, /3 track\(s\) found/);

	const metaLink = root.querySelector('a.yad-metadata');
	assert.equal(metaLink.getAttribute('download'), 'The Big Adventure.txt');
	const textarea = root.querySelector('textarea');
	const fileText = await blobText(page.window, page.blobs.get(metaLink.getAttribute('href')));
	assert.equal(fileText, textarea.value, 'downloaded file matches the textarea');
	assert.match(fileText, /^Basic Details\n/);
	assert.match(fileText, /TrackNumber:: 003/);
});

test('removes player controls and the app download footer', () => {
	const page = loadPage(pageHtml(officialCard));
	page.paste();
	assert.equal(page.document.querySelector('.player-controls').children.length, 0);
	assert.equal(page.document.querySelector('[class*="Footer_appDownloadBar"]'), null);
	assert.ok(page.document.querySelector('main h1'), 'original page content is kept');
});

test('MYO card without author/icons works', async () => {
	const page = loadPage(pageHtml(myoCard));
	page.paste();
	const root = panel(page.document);
	assert.deepEqual(page.errors, []);
	assert.equal(root.querySelectorAll('a.yad-track').length, 1);
	assert.equal(root.querySelectorAll('a.yad-icon').length, 0);
	assert.match(root.querySelector('.yad-card-info span').textContent, /\(by undefined\)/);
	assert.match(root.querySelector('textarea').value, /ShareCount:: 3/);
});

test('real MYO card shape (as seen on share.yoto.co)', () => {
	const page = loadPage(pageHtml(realShapeMyoCard));
	page.paste();
	const root = panel(page.document);
	assert.deepEqual(page.errors, []);
	assert.deepEqual([...root.querySelectorAll('a.yad-track')].map((a) => a.textContent),
		['Story Time - 001 - Story_One_128k.opus', 'Story Time - 002 - Story Two.opus']);
	assert.equal(root.querySelectorAll('a.yad-icon').length, 0, 'null icons are skipped');
	assert.equal(root.querySelector('a.yad-cover').textContent, 'Story Time - Artwork.gif');
	assert.equal(page.document.querySelectorAll('[class*="Footer_appDownloadBar"]').length, 0);
	assert.doesNotMatch(root.querySelector('textarea').value, /user-private-id/);
});

test('titles with quotes and HTML do not break the markup or inject elements', async () => {
	const page = loadPage(pageHtml(trickyCard));
	page.paste();
	const root = panel(page.document);
	assert.deepEqual(page.errors, []);
	assert.equal(root.querySelectorAll('script').length, 0, 'no script element injected');
	assert.equal(root.querySelectorAll('b').length, 0, 'no <b> injected from description');

	const links = root.querySelectorAll('a.yad-track');
	assert.equal(links.length, 1, 'track without url has no link');
	assert.equal(links[0].title, links[0].textContent);
	assert.ok(!/[\\/:*?"<>|]/.test(links[0].textContent), 'file name is sanitized');
	const rows = root.querySelectorAll('tr[data-track]');
	assert.equal(rows.length, 2);
	assert.match(rows[1].textContent, /002 - No audio url/);

	assert.equal(root.querySelector('a.yad-metadata').getAttribute('download'), `Peter's _Best_ _Songs__ Vol_1_.txt`);
	assert.equal(root.querySelector('a.yad-cover'), null, 'no cover link when cover is missing');
	assert.match(root.querySelector('.yad-card-info span').textContent, /\(by O'Brien & Sons\)$/);

	const text = root.querySelector('textarea').value;
	assert.ok(text.includes('Description:: Uses <b>bold</b> & &amp; entities'), 'metadata keeps text verbatim');
	assert.ok(text.includes(`Title:: It's <script>alert(1)</script> time`));
});

test('running the script twice replaces the panel instead of throwing', () => {
	const page = loadPage(pageHtml(officialCard));
	page.paste();
	const firstHref = panel(page.document).querySelector('a.yad-metadata').getAttribute('href');
	assert.doesNotThrow(() => page.paste());
	assert.equal(page.document.querySelectorAll('#yoto-archival-downloader').length, 1);
	assert.ok(!page.blobs.has(firstHref), 'old blob URL revoked');
	assert.deepEqual(page.errors, []);
});

test('copy button writes metadata to the clipboard', async () => {
	const page = loadPage(pageHtml(officialCard));
	let copied = null;
	Object.defineProperty(page.window.navigator, 'clipboard', {
		value: { writeText: (s) => { copied = s; return Promise.resolve(); } },
		configurable: true,
	});
	page.paste();
	const root = panel(page.document);
	const button = root.querySelector('button.yad-copy');
	button.click();
	await new Promise((r) => setTimeout(r, 0));
	assert.equal(copied, root.querySelector('textarea').value);
	assert.equal(button.textContent, 'Copied!');
});

const errorText = (document) => {
	const root = panel(document);
	assert.ok(root, 'an error panel is shown on the page');
	assert.ok(root.classList.contains('yad-error'));
	assert.equal(root.querySelectorAll('a.yad-track').length, 0);
	return root.querySelector('.yad-error-message').textContent;
};

const nextDataPage = (data) => `<!DOCTYPE html><html><body><script id="__NEXT_DATA__" type="application/json">${typeof data === 'string' ? data : JSON.stringify(data)}</script></body></html>`;

test('pages without card data show the reason on the page and in the console', async (t) => {
	await t.test('not a Yoto page', () => {
		const page = loadPage('<!DOCTYPE html><html><body><p>not a yoto page</p></body></html>');
		assert.doesNotThrow(() => page.paste());
		assert.match(errorText(page.document), /Playlist data not found/);
		assert.match(page.errors.join('\n'), /Playlist data not found/);
	});
	await t.test('broken JSON', () => {
		const page = loadPage(nextDataPage('{not json'));
		assert.doesNotThrow(() => page.paste());
		assert.match(errorText(page.document), /not valid JSON/);
	});
	await t.test('Yoto shop page', () => {
		const page = loadPage(nextDataPage({ props: { pageProps: { productOnPage: { title: 'A box set' } } } }));
		page.paste();
		assert.match(errorText(page.document), /shop page/);
	});
	await t.test('card link without the "?" part', () => {
		const page = loadPage(nextDataPage({ props: { pageProps: { card: null, contentId: 'abc12', qsParams: {} } } }));
		page.paste();
		assert.match(errorText(page.document), /missing the part after "\?"/);
	});
	await t.test('full link but Yoto returns no card (expired/invalid/unlinked)', () => {
		const page = loadPage(nextDataPage({ props: { pageProps: { card: null, isPhysicalCard: true, contentId: 'abc12', qsParams: { k: 'v' } } } }));
		page.paste();
		assert.match(errorText(page.document), /expired or invalid/);
	});
	await t.test('unknown shape', () => {
		const page = loadPage(nextDataPage({ props: { pageProps: {} } }));
		page.paste();
		assert.match(errorText(page.document), /Card data not found/);
	});
	await t.test('a later successful run replaces the error panel', () => {
		const page = loadPage(nextDataPage({ props: { pageProps: { card: null, qsParams: {} } } }));
		page.paste();
		page.document.getElementById('__NEXT_DATA__').textContent = JSON.stringify({ props: { pageProps: { card: officialCard } } });
		page.paste();
		assert.equal(page.document.querySelectorAll('#yoto-archival-downloader').length, 1);
		assert.equal(panel(page.document).querySelectorAll('a.yad-track').length, 3);
	});
});
