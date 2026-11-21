#!/usr/bin/env node
'use strict';

// Minifies yoto-archival-downloader_v3.js into a bookmarklet and writes it to
// dist/bookmarklet.txt. With --readme it also refreshes the bookmarklet block
// in README.md (between the BOOKMARKLET markers).

const fs = require('node:fs');
const path = require('node:path');
const { minify } = require('terser');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'yoto-archival-downloader_v3.js');
const OUT_DIR = path.join(ROOT, 'dist');
const OUT_FILE = path.join(OUT_DIR, 'bookmarklet.txt');
const README = path.join(ROOT, 'README.md');

async function buildBookmarklet() {
	const source = fs.readFileSync(SOURCE, 'utf8');
	const result = await minify(source, {
		compress: { passes: 2 },
		mangle: true,
		format: { comments: false },
	});
	if (!result.code) throw new Error('terser returned no code');
	// void(...) makes sure the browser does not navigate to the return value
	return `javascript:${encodeURIComponent(`void(function(){${result.code}})()`)}`;
}

async function main() {
	const bookmarklet = await buildBookmarklet();
	fs.mkdirSync(OUT_DIR, { recursive: true });
	fs.writeFileSync(OUT_FILE, `${bookmarklet}\n`);
	console.log(`Wrote ${path.relative(ROOT, OUT_FILE)} (${bookmarklet.length} characters)`);

	if (process.argv.includes('--readme')) {
		const readme = fs.readFileSync(README, 'utf8');
		const pattern = /(<!-- BOOKMARKLET:START -->\n```\n)[\s\S]*?(\n```\n<!-- BOOKMARKLET:END -->)/;
		if (!pattern.test(readme)) throw new Error('BOOKMARKLET markers not found in README.md');
		fs.writeFileSync(README, readme.replace(pattern, (_, start, end) => `${start}${bookmarklet}${end}`));
		console.log('Updated README.md');
	}
}

if (require.main === module) {
	main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { buildBookmarklet };
