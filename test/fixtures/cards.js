'use strict';

// Synthetic card data shaped like the __NEXT_DATA__ payload on yoto.io card
// pages. No real card IDs or URLs are used.

const officialCard = {
	cardId: 'abc12',
	title: 'The Big Adventure',
	slug: 'the-big-adventure',
	sortkey: 'big-adventure-the',
	createdAt: '2023-01-02T03:04:05.000Z',
	updatedAt: '2024-05-06T07:08:09.000Z',
	metadata: {
		author: 'Jane Writer',
		category: 'stories',
		description: 'A story about a big adventure.',
		languages: ['en', 'en-GB'],
		note: 'Narrated by Sam',
		cover: { imageL: 'https://cdn.example.test/covers/big-adventure.jpg' },
		media: { duration: 3725, fileSize: 15728640 },
	},
	content: {
		version: '2',
		playbackType: 'linear',
		chapters: [
			{
				display: { icon16x16: 'https://cdn.example.test/icons/ch1.png' },
				tracks: [
					{ title: 'Chapter One', trackUrl: 'https://cdn.example.test/audio/1.mp3', format: 'mp3', type: 'audio', duration: 600, fileSize: 2097152, channels: 'stereo' },
					{ title: 'Chapter One (part 2)', trackUrl: 'https://cdn.example.test/audio/2.mp3', format: 'mp3', type: 'audio', duration: 59.6, fileSize: 1048576, channels: 'stereo' },
				],
			},
			{
				display: { icon16x16: 'https://cdn.example.test/icons/ch2.png' },
				tracks: [
					{ title: 'Chapter Two', trackUrl: 'https://cdn.example.test/audio/3.mp3', format: 'aac', type: 'audio', duration: 3066, fileSize: 12582912, channels: 'mono',
						display: { icon16x16: 'https://cdn.example.test/icons/track3.png' } },
				],
			},
		],
	},
};

// Make-Your-Own playlist: no author/category/slug, share stats present,
// languages missing.
const myoCard = {
	cardId: 'myo99',
	title: 'Bedtime Songs',
	sortkey: 'bedtime-songs',
	createdAt: '2024-02-03T00:00:00.000Z',
	updatedAt: '2024-02-04T00:00:00.000Z',
	shareCount: 3,
	availability: 'shared',
	shareLinkUrl: 'https://share.example.test/xyz',
	metadata: {
		description: '',
		cover: { imageL: 'https://cdn.example.test/covers/myo.jpg' },
		media: { duration: 120, fileSize: 1024 },
	},
	content: {
		version: '1',
		playbackType: 'linear',
		chapters: [
			{ display: {}, tracks: [{ title: 'Song A', trackUrl: 'https://cdn.example.test/audio/a.mp3', format: 'mp3', type: 'audio', duration: 120, fileSize: 1024, channels: 'stereo' }] },
		],
	},
};

// Titles with characters that broke v1/v2 (quotes, HTML, path separators)
// and a card with lots of missing fields.
const trickyCard = {
	cardId: 'tr1ck',
	title: `Peter's "Best" <Songs>: Vol/1?`,
	metadata: {
		author: `O'Brien & Sons`,
		description: 'Uses <b>bold</b> & &amp; entities',
	},
	content: {
		chapters: [
			{ tracks: [
				{ title: `It's <script>alert(1)</script> time`, trackUrl: 'https://cdn.example.test/audio/x.mp3' },
				{ title: 'No audio url' },
			] },
			{ display: { icon16x16: 'https://cdn.example.test/icons/q.png' } }, // chapter without tracks
		],
	},
};

// Shaped like a real MYO card payload seen on share.yoto.co (Nov 2026):
// track titles are the uploaded file names (".mp3") while the audio is
// re-encoded to Opus, icons are null, authors/narrators are lists,
// availability lives under content, and a userId is present (must not leak).
const realShapeMyoCard = {
	cardId: 'zz9Qx',
	title: 'Story Time',
	slug: 'ABCDEFGHIJ-KLMNOPQRST',
	sortkey: 'ABCDEFGHIJ-KLMNOPQRST',
	userId: 'user-private-id-0123456789abcd',
	createdAt: '2026-01-01T10:00:00.000Z',
	updatedAt: '2026-01-02T10:00:00.000Z',
	metadata: {
		abridged: false, accents: [], authors: [], copyrights: ['©'], narrators: [],
		cover: { imageL: 'https://cdn.example.test/myo-cover/fish.gif' },
		media: { duration: 1888, fileSize: 23000000 },
	},
	content: {
		activity: 'yoto_Player',
		availability: '',
		config: { resumeTimeout: 2592000, onlineOnly: false },
		cover: { imageL: 'https://cdn.example.test/myo-cover/fish.gif' },
		playbackType: 'linear',
		version: '1',
		chapters: [
			{ key: '01', title: 'Story_One_128k.mp3', duration: 1261, fileSize: 15711588, display: { icon16x16: null }, overlayLabel: '1', ambient: null,
				tracks: [{ key: 'a1', title: 'Story_One_128k.mp3', trackUrl: 'https://media.example.test/secure/aaa', format: 'opus', type: 'audio', duration: 1261, fileSize: 15711588, channels: 'stereo', display: null, ambient: null, overlayLabel: '1' }] },
			{ key: '02', title: 'Story Two.MP3', duration: 627, fileSize: 7288412, display: { icon16x16: null }, overlayLabel: '2', ambient: null,
				tracks: [{ key: 'b2', title: 'Story Two.MP3', trackUrl: 'https://media.example.test/secure/bbb', format: 'opus', type: 'audio', duration: 627, fileSize: 7288412, channels: 'stereo', display: null, ambient: null, overlayLabel: '2' }] },
		],
	},
};

function nextData(card) {
	return { props: { pageProps: { card } }, page: '/card/[id]', query: {} };
}

// A minimal stand-in for a yoto.io card page
function pageHtml(card) {
	const json = JSON.stringify(nextData(card)).replace(/</g, '\\u003c');
	return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Yoto test page</title></head>
<body>
<div id="__next">
  <main><h1>Original page content</h1><a href="https://cdn.example.test/useless.mp3">useless</a></main>
  <div class="player-controls"><button>Play</button><a href="#">control link</a></div>
  <div class="Footer_appDownloadBar__Xy12z share-footer"><div class="Footer_appDownloadBarContent__Ab12c"><a href="#">Get the app</a></div></div>
</div>
<script id="__NEXT_DATA__" type="application/json">${json}</script>
</body></html>`;
}

module.exports = { officialCard, myoCard, trickyCard, realShapeMyoCard, nextData, pageHtml };
