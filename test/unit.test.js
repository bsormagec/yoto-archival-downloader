'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const yad = require('../yoto-archival-downloader_v3.js');
const { officialCard, myoCard, trickyCard, nextData } = require('./fixtures/cards');

test('convertSeconds', async (t) => {
	await t.test('formats hours, minutes and seconds', () => {
		assert.equal(yad.convertSeconds(0), '0h 0m 0s');
		assert.equal(yad.convertSeconds(59), '0h 0m 59s');
		assert.equal(yad.convertSeconds(3725), '1h 2m 5s');
		assert.equal(yad.convertSeconds(86400), '24h 0m 0s');
	});
	await t.test('rounds fractional seconds', () => {
		assert.equal(yad.convertSeconds(59.6), '0h 1m 0s');
		assert.equal(yad.convertSeconds(12.4), '0h 0m 12s');
	});
	await t.test('returns "undefined" for missing or invalid input', () => {
		for (const bad of [undefined, null, NaN, Infinity, -1, '60', {}]) {
			assert.equal(yad.convertSeconds(bad), 'undefined', `input ${String(bad)}`);
		}
	});
});

test('formatBytes', async (t) => {
	await t.test('formats sizes', () => {
		assert.equal(yad.formatBytes(0), '0 Bytes');
		assert.equal(yad.formatBytes(500), '500 Bytes');
		assert.equal(yad.formatBytes(1024), '1 KB');
		assert.equal(yad.formatBytes(1536), '1.5 KB');
		assert.equal(yad.formatBytes(15728640), '15 MB');
		assert.equal(yad.formatBytes(1234567, 0), '1 MB');
	});
	await t.test('does not overflow the unit list', () => {
		assert.equal(yad.formatBytes(Math.pow(1024, 6)), '1048576 TB');
	});
	await t.test('returns "undefined" for missing or invalid input', () => {
		for (const bad of [undefined, null, NaN, -5, '1024']) {
			assert.equal(yad.formatBytes(bad), 'undefined', `input ${String(bad)}`);
		}
	});
});

test('orUndef', () => {
	assert.equal(yad.orUndef(undefined), 'undefined');
	assert.equal(yad.orUndef(null), 'undefined');
	assert.equal(yad.orUndef(''), 'undefined');
	assert.equal(yad.orUndef([]), 'undefined');
	assert.equal(yad.orUndef(['en', 'fr']), 'en,fr');
	assert.equal(yad.orUndef(0), '0');
	assert.equal(yad.orUndef(false), 'false');
	assert.equal(yad.orUndef('x'), 'x');
});

test('sanitizeFilename', async (t) => {
	await t.test('replaces characters that are invalid in file names', () => {
		assert.equal(yad.sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'a_b_c_d_e_f_g_h_i_j');
	});
	await t.test('keeps apostrophes and unicode', () => {
		assert.equal(yad.sanitizeFilename(`Peter's Café – Ünïcode 🎵`), `Peter's Café – Ünïcode 🎵`);
	});
	await t.test('collapses whitespace, strips control chars and trailing dots', () => {
		assert.equal(yad.sanitizeFilename('  a \t\n b\u0007c ...  '), 'a bc');
	});
	await t.test('falls back to "untitled"', () => {
		assert.equal(yad.sanitizeFilename(''), 'untitled');
		assert.equal(yad.sanitizeFilename(undefined), 'untitled');
		assert.equal(yad.sanitizeFilename('...'), 'untitled');
	});
});

test('extractCard', () => {
	assert.equal(yad.extractCard(nextData(officialCard)), officialCard);
	assert.throws(() => yad.extractCard({}), /Card data not found/);
	assert.throws(() => yad.extractCard(null), /Card data not found/);
	assert.throws(() => yad.extractCard({ props: { pageProps: {} } }), /Card data not found/);
});

test('buildTrackList', async (t) => {
	await t.test('numbers tracks across chapters with 3-digit padding', () => {
		const tracks = yad.buildTrackList(officialCard);
		assert.deepEqual(tracks.map((x) => x.pad), ['001', '002', '003']);
		assert.equal(tracks[0].filename, 'The Big Adventure - 001 - Chapter One');
		assert.equal(tracks[2].filename, 'The Big Adventure - 003 - Chapter Two');
		assert.equal(tracks[0].iconFilename, 'The Big Adventure - 001 - Chapter One (icon)');
		assert.equal(tracks[1].trackUrl, 'https://cdn.example.test/audio/2.mp3');
	});
	await t.test('uses the chapter icon, preferring a track-specific icon', () => {
		const tracks = yad.buildTrackList(officialCard);
		assert.equal(tracks[0].iconUrl, 'https://cdn.example.test/icons/ch1.png');
		assert.equal(tracks[2].iconUrl, 'https://cdn.example.test/icons/track3.png');
		assert.equal(yad.buildTrackList(myoCard)[0].iconUrl, '');
	});
	await t.test('handles tricky titles, missing urls and chapters without tracks', () => {
		const tracks = yad.buildTrackList(trickyCard);
		assert.equal(tracks.length, 2);
		assert.equal(tracks[0].filename, `Peter's _Best_ _Songs__ Vol_1_ - 001 - It's _script_alert(1)__script_ time`);
		assert.equal(tracks[1].trackUrl, '');
	});
	await t.test('returns an empty list when there is no content', () => {
		assert.deepEqual(yad.buildTrackList({ title: 'x' }), []);
		assert.deepEqual(yad.buildTrackList({ title: 'x', content: { chapters: null } }), []);
	});
});

test('buildMetadataText', async (t) => {
	await t.test('official card', () => {
		const text = yad.buildMetadataText(officialCard, yad.buildTrackList(officialCard));
		const expectedSnippets = [
			'Basic Details\n================\nTitle:: The Big Adventure\nAuthor:: Jane Writer\nDescription:: A story about a big adventure.\n',
			'Languages:: en,en-GB',
			'Category:: stories',
			'Slug:: the-big-adventure',
			'Duration:: 3725\nReadableDuration:: 1h 2m 5s',
			'FileSize:: 15728640\nReadableFileSize:: 15 MB',
			'Note:: Narrated by Sam',
			'ShareCount:: undefined',
			'TrackNumber:: 002\nTitle:: Chapter One (part 2)\nFormat:: mp3\nType:: audio\nDuration (Seconds):: 59.6\nReadableDuration:: 0h 1m 0s',
			'TrackNumber:: 003\nTitle:: Chapter Two\nFormat:: aac',
		];
		for (const snippet of expectedSnippets) assert.ok(text.includes(snippet), `missing: ${snippet}`);
		assert.equal((text.match(/TrackNumber::/g) || []).length, 3);
	});
	await t.test('MYO card shows share stats and "undefined" for official-only fields', () => {
		const text = yad.buildMetadataText(myoCard, yad.buildTrackList(myoCard));
		for (const snippet of ['Author:: undefined', 'Category:: undefined', 'Slug:: undefined', 'Languages:: undefined',
			'Description:: undefined', 'ShareCount:: 3', 'Availability:: shared', 'ShareLinkUrl:: https://share.example.test/xyz']) {
			assert.ok(text.includes(snippet), `missing: ${snippet}`);
		}
	});
	await t.test('card with missing metadata/media does not throw', () => {
		const text = yad.buildMetadataText(trickyCard, yad.buildTrackList(trickyCard));
		assert.ok(text.includes(`Title:: Peter's "Best" <Songs>: Vol/1?`));
		assert.ok(text.includes('Description:: Uses <b>bold</b> & &amp; entities'), 'text must be kept verbatim');
		assert.ok(text.includes('Duration:: undefined\nReadableDuration:: undefined'));
		assert.ok(text.includes('FileSize:: undefined\nReadableFileSize:: undefined'));
		assert.doesNotMatch(text, /NaN/);
	});
	await t.test('does not leak personal data fields', () => {
		const card = Object.assign({}, myoCard, { userId: 'secret-user', ownerEmail: 'someone@example.test' });
		const text = yad.buildMetadataText(card, yad.buildTrackList(card));
		assert.doesNotMatch(text, /secret-user|someone@example\.test/);
	});
});
