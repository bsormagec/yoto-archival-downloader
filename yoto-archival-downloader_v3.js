/*
 * Archival Downloader for Yoto - v3
 * https://github.com/humor4fun/yoto-archival-downloader
 *
 * Paste this whole file into the browser console on a yoto.io card page
 * (or use the bookmarklet built from it). It reads the card data that the
 * page already contains and adds a panel with links to every track, icon,
 * the cover art and a metadata text file.
 *
 * The file is wrapped in an IIFE so it can be run several times on the same
 * page without "Identifier has already been declared" errors. When loaded
 * from Node (tests) it exports its functions instead of touching the page.
 */
(function () {
	'use strict';

	const UNDEF = 'undefined'; // shown when a field is not present on the card
	const CONTAINER_ID = 'yoto-archival-downloader';
	const REPO_URL = 'https://github.com/humor4fun/yoto-archival-downloader';

	// ---------------------------------------------------------------------
	// Pure helpers (no DOM access) - covered by unit tests
	// ---------------------------------------------------------------------

	const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

	// Convert a number of seconds into "1h 2m 3s"
	function convertSeconds(seconds) {
		if (!isNumber(seconds) || seconds < 0) return UNDEF;
		const total = Math.round(seconds);
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		const remainingSeconds = total % 60;
		return `${hours}h ${minutes}m ${remainingSeconds}s`;
	}

	// Convert a number of bytes into "1.5 MB"
	function formatBytes(bytes, decimals = 2) {
		if (!isNumber(bytes) || bytes < 0) return UNDEF;
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const dm = decimals < 0 ? 0 : decimals;
		const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
	}

	// Return the value, or 'undefined' when it is missing or empty
	function orUndef(value) {
		if (value === undefined || value === null || value === '') return UNDEF;
		if (Array.isArray(value)) return value.length ? value.join(',') : UNDEF;
		return String(value);
	}

	// Make a string safe to use as a file name on Windows, macOS and Linux
	function sanitizeFilename(name) {
		const cleaned = String(name === undefined || name === null ? '' : name)
			.replace(/[\u0000-\u001f\u007f]/g, '') // control characters
			.replace(/[\\/:*?"<>|]/g, '_') // characters forbidden in file names
			.replace(/\s+/g, ' ')
			.trim()
			.replace(/[. ]+$/, ''); // Windows does not allow a trailing dot or space
		return cleaned || 'untitled';
	}

	// File extension for a track, based on its format. Yoto re-encodes MYO
	// uploads (often to Opus in an Ogg container), so the format field is
	// more reliable than the original file name in the track title.
	const FORMAT_EXTENSIONS = { opus: 'opus', ogg: 'ogg', mp3: 'mp3', aac: 'aac', m4a: 'm4a', mp4: 'm4a', wav: 'wav', flac: 'flac' };
	const AUDIO_EXT_RE = /\.(mp3|m4a|m4b|aac|ogg|oga|opus|wav|flac|wma)$/i;

	function audioExtension(format) {
		const ext = FORMAT_EXTENSIONS[String(format || '').toLowerCase()];
		return ext ? `.${ext}` : '';
	}

	// Remove an audio extension left over from the uploaded file name
	function stripAudioExtension(title) {
		return String(title === undefined || title === null ? '' : title).replace(AUDIO_EXT_RE, '');
	}

	// Extension from a URL path, e.g. ".gif" for ".../cover.gif?x=1"
	function urlExtension(url) {
		const match = /\.([a-z0-9]{2,5})$/i.exec(String(url || '').split(/[?#]/)[0]);
		return match ? `.${match[1].toLowerCase()}` : '';
	}

	// Author can be a string (author) or a list (authors)
	function cardAuthor(metadata) {
		return orUndef((metadata && (metadata.author || metadata.authors)) || '');
	}

	// Get the card object from the parsed __NEXT_DATA__ JSON
	function extractCard(nextData) {
		const card = nextData && nextData.props && nextData.props.pageProps && nextData.props.pageProps.card;
		if (!card || typeof card !== 'object') {
			throw new Error('Card data not found in __NEXT_DATA__');
		}
		return card;
	}

	// Flatten chapters -> tracks into one numbered list
	function buildTrackList(card) {
		const cardTitle = sanitizeFilename(card.title);
		const chapters = (card.content && Array.isArray(card.content.chapters)) ? card.content.chapters : [];
		const tracks = [];

		chapters.forEach((chapter) => {
			const chapterTracks = Array.isArray(chapter && chapter.tracks) ? chapter.tracks : [];
			chapterTracks.forEach((track) => {
				const number = tracks.length + 1;
				const pad = String(number).padStart(3, '0');
				const iconUrl = (track.display && track.display.icon16x16) ||
					(chapter.display && chapter.display.icon16x16) || '';
				const filename = `${cardTitle} - ${pad} - ${sanitizeFilename(stripAudioExtension(track.title))}`;
				const iconExt = urlExtension(iconUrl);
				tracks.push({
					number,
					pad,
					title: track.title === undefined ? UNDEF : String(track.title),
					trackUrl: track.trackUrl || '',
					iconUrl,
					filename: filename + audioExtension(track.format),
					iconFilename: `${filename} (icon)${iconExt}`,
					track,
				});
			});
		});

		return tracks;
	}

	// Build the metadata text file. Only non-identifying fields are written,
	// using ":: " as the key/value delimiter for easier parsing later on.
	function buildMetadataText(card, tracks) {
		const metadata = card.metadata || {};
		const media = metadata.media || {};
		const content = card.content || {};
		const lines = [];
		const add = (key, value) => lines.push(`${key}:: ${value}`);
		const section = (name) => lines.push(name, '================');

		section('Basic Details');
		add('Title', orUndef(card.title));
		add('Author', cardAuthor(metadata));
		add('Narrators', orUndef(metadata.narrators));
		add('Description', orUndef(metadata.description));
		lines.push('');

		section('Extended Details');
		add('Version', orUndef(content.version));
		add('Category', orUndef(metadata.category)); // only exists for official cards
		add('Languages', orUndef(metadata.languages));
		add('PlaybackType', orUndef(content.playbackType));
		add('CardID', orUndef(card.cardId));
		add('CreatedAt', orUndef(card.createdAt));
		add('UpdatedAt', orUndef(card.updatedAt));
		add('Slug', orUndef(card.slug)); // only exists for official cards
		add('sortkey', orUndef(card.sortkey));
		add('Duration', orUndef(media.duration));
		add('ReadableDuration', convertSeconds(media.duration));
		add('FileSize', orUndef(media.fileSize));
		add('ReadableFileSize', formatBytes(media.fileSize));
		add('Note', orUndef(metadata.note));
		lines.push('');

		section('Share Statistics'); // only exists for MYO cards
		add('ShareCount', orUndef(card.shareCount));
		add('Availability', orUndef(card.availability || content.availability));
		add('ShareLinkUrl', orUndef(card.shareLinkUrl));
		lines.push('');

		section('Track Details');
		tracks.forEach(({ pad, track }) => {
			add('TrackNumber', pad);
			add('Title', orUndef(track.title));
			add('Format', orUndef(track.format));
			add('Type', orUndef(track.type));
			add('Duration (Seconds)', orUndef(track.duration));
			add('ReadableDuration', convertSeconds(track.duration));
			add('FileSize', orUndef(track.fileSize));
			add('ReadableFileSize', formatBytes(track.fileSize));
			add('Channels', orUndef(track.channels));
			lines.push('');
		});

		return lines.join('\n');
	}

	// ---------------------------------------------------------------------
	// DOM part
	// ---------------------------------------------------------------------

	// Small helper to create elements without innerHTML, so titles containing
	// quotes or "<" can never break the markup.
	function el(doc, tag, props, children) {
		const node = doc.createElement(tag);
		Object.entries(props || {}).forEach(([key, value]) => {
			if (value === undefined || value === null) return;
			if (key === 'style') Object.assign(node.style, value);
			else if (key === 'text') node.textContent = value;
			else if (key in node && key !== 'download') node[key] = value;
			else node.setAttribute(key, value);
		});
		(children || []).forEach((child) => {
			if (child) node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
		});
		return node;
	}

	function link(doc, href, text, title, extra) {
		return el(doc, 'a', Object.assign({ href, title, target: '_blank', rel: 'noopener', text }, extra));
	}

	function buildTrackTable(doc, tracks) {
		const cell = { border: '1px solid white', padding: '2px 6px' };
		const header = el(doc, 'tr', { style: { color: '#ffffff', backgroundColor: '#336699' } }, [
			el(doc, 'th', { text: '#', style: { textAlign: 'center' } }),
			el(doc, 'th', { text: 'Track', style: { textAlign: 'left' } }),
			el(doc, 'th', { text: 'Icon', style: { textAlign: 'center' } }),
		]);
		const rows = tracks.map((t) => el(doc, 'tr', { 'data-track': t.pad }, [
			el(doc, 'td', { text: String(t.number), style: Object.assign({ width: '35px' }, cell) }),
			el(doc, 'td', { style: Object.assign({ textAlign: 'left' }, cell) }, [
				t.trackUrl ? link(doc, t.trackUrl, t.filename, t.filename, { className: 'yad-track' }) : t.filename,
			]),
			el(doc, 'td', { style: Object.assign({ textAlign: 'center', width: '45px' }, cell) }, [
				t.iconUrl ? el(doc, 'a', { href: t.iconUrl, title: t.iconFilename, target: '_blank', rel: 'noopener', className: 'yad-icon' }, [
					el(doc, 'img', { src: t.iconUrl, alt: t.iconFilename, style: { border: '0' } }),
				]) : null,
			]),
		]));
		return el(doc, 'table', {
			className: 'yad-tracks',
			style: { border: '0', borderSpacing: '0', backgroundColor: '#cfcfcf' },
		}, [header].concat(rows));
	}

	function removePageClutter(doc) {
		// Remove the player controls and the app download footer so Simple
		// Mass Downloader only sees the useful links. CSS module class names
		// get a random suffix, so match on the prefix.
		doc.querySelectorAll('.player-controls').forEach((node) => node.replaceChildren());
		doc.querySelectorAll('[class*="Footer_appDownloadBar"]').forEach((node) => node.remove());
	}

	function run(doc, win) {
		doc = doc || document;
		win = win || window;

		const scriptElement = doc.getElementById('__NEXT_DATA__');
		if (!scriptElement) {
			console.error('[Yoto Archival Downloader] Playlist data not found. Open a yoto.io card link first.');
			return null;
		}

		let card;
		try {
			card = extractCard(JSON.parse(scriptElement.textContent));
		} catch (err) {
			console.error('[Yoto Archival Downloader] Could not read card data:', err);
			return null;
		}

		const metadata = card.metadata || {};
		const cardTitle = sanitizeFilename(card.title);
		const author = cardAuthor(metadata);
		const coverUrl = (metadata.cover && metadata.cover.imageL) ||
			(card.content && card.content.cover && card.content.cover.imageL) || '';
		const coverName = `${cardTitle} - Artwork${urlExtension(coverUrl)}`;
		const tracks = buildTrackList(card);
		const metaText = buildMetadataText(card, tracks);

		// Running the script again replaces the previous panel
		const previous = doc.getElementById(CONTAINER_ID);
		if (previous) {
			const oldLink = previous.querySelector('a[download]');
			if (oldLink && win.URL && win.URL.revokeObjectURL) win.URL.revokeObjectURL(oldLink.href);
			previous.remove();
		}

		// Metadata download (Blob) + copy-to-clipboard button
		const blob = new win.Blob([metaText], { type: 'text/plain;charset=utf-8' });
		const metaLink = el(doc, 'a', {
			href: win.URL.createObjectURL(blob),
			download: `${cardTitle}.txt`,
			className: 'yad-metadata',
			text: '[ Get Metadata ]',
		});
		const textMeta = el(doc, 'textarea', { rows: 5, cols: 50, readOnly: true, className: 'yad-metadata-text' });
		textMeta.value = metaText;

		const copyButton = el(doc, 'button', { type: 'button', text: 'Copy', className: 'yad-copy', style: { marginLeft: '10px' } });
		copyButton.addEventListener('click', () => {
			const done = () => { copyButton.textContent = 'Copied!'; };
			const clipboard = win.navigator && win.navigator.clipboard;
			if (clipboard && clipboard.writeText) {
				clipboard.writeText(metaText).then(done, () => { textMeta.select(); });
			} else {
				textMeta.select();
			}
		});

		// Cover art + title section
		const cardInfo = el(doc, 'div', { className: 'yad-card-info' }, [
			coverUrl ? el(doc, 'img', {
				src: coverUrl,
				alt: coverName,
				style: { float: 'left', height: '150px', border: '0', margin: '0 20px 20px 0' },
			}) : null,
			el(doc, 'span', { text: `${orUndef(card.title)} (by ${author})`, style: { fontWeight: 'bold', fontSize: '13pt' } }),
			el(doc, 'br'),
			coverUrl ? link(doc, coverUrl, coverName, coverName, { className: 'yad-cover' }) : null,
			el(doc, 'div', { style: { clear: 'both' } }),
		]);

		const container = el(doc, 'div', {
			id: CONTAINER_ID,
			style: {
				margin: '20px',
				backgroundColor: 'rgba(244, 84, 54, .6)',
				padding: '20px',
				font: 'normal 10pt "Source Sans Pro", "Source Sans", Calibri, Arial, Tahoma, sans-serif',
			},
		}, [
			el(doc, 'h2', {}, [link(doc, REPO_URL, 'Archival Downloader for Yoto', 'Need help? Open the project page.')]),
			el(doc, 'p', { text: `Need help? Click the title. ${tracks.length} track(s) found.` }),
			cardInfo,
			el(doc, 'div', {}, [
				el(doc, 'h3', { text: 'Archival Metadata' }),
				metaLink,
				copyButton,
				el(doc, 'p'),
				textMeta,
			]),
			buildTrackTable(doc, tracks),
		]);

		removePageClutter(doc);
		doc.body.insertBefore(container, doc.body.firstChild);
		return { card, tracks, metaText, container };
	}

	const api = {
		convertSeconds,
		formatBytes,
		orUndef,
		sanitizeFilename,
		audioExtension,
		stripAudioExtension,
		urlExtension,
		cardAuthor,
		extractCard,
		buildTrackList,
		buildMetadataText,
		run,
		UNDEF,
		CONTAINER_ID,
	};

	if (typeof module === 'object' && module && module.exports && typeof document === 'undefined') {
		module.exports = api;
	} else {
		run(document, window);
	}
})();
