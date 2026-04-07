#!/usr/bin/env node

/**
 * Prebuild script: fetches all wiki markdown from the private secondbrain repo
 * and outputs a single wiki-data.json to public/assets/.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node tools/fetch-wiki.mjs
 *
 * The token needs read access to repo contents of mhylle/secondbrain.
 */

const OWNER = 'mhylle';
const REPO = 'secondbrain';
const BRANCH = 'master';
const WIKI_DIR = 'wiki';
const API_BASE = 'https://api.github.com';
const RAW_BASE = 'https://raw.githubusercontent.com';
const OUTPUT_PATH = 'public/assets/wiki-data.json';

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const token = process.env.GITHUB_TOKEN;
if (!token) {
  console.error('ERROR: GITHUB_TOKEN environment variable is required');
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github.v3+json',
  'User-Agent': 'secondbrain-wiki-builder'
};

async function fetchJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${url}`);
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { ...headers, Accept: 'text/plain' }
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${url}`);
  }
  return res.text();
}

async function main() {
  console.log('Fetching file tree...');
  const tree = await fetchJson(
    `${API_BASE}/repos/${OWNER}/${REPO}/git/trees/${BRANCH}?recursive=1`
  );

  const wikiPaths = tree.tree
    .filter(
      (entry) =>
        entry.type === 'blob' &&
        entry.path.startsWith(`${WIKI_DIR}/`) &&
        entry.path.endsWith('.md')
    )
    .map((entry) => entry.path);

  console.log(`Found ${wikiPaths.length} wiki files. Fetching content...`);

  const batchSize = 15;
  const files = {};

  for (let i = 0; i < wikiPaths.length; i += batchSize) {
    const batch = wikiPaths.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (filePath) => {
        const url = `${RAW_BASE}/${OWNER}/${REPO}/${BRANCH}/${filePath}`;
        try {
          const content = await fetchText(url);
          return { path: filePath, content };
        } catch (err) {
          console.warn(`  WARN: failed to fetch ${filePath}: ${err.message}`);
          return null;
        }
      })
    );

    for (const result of results) {
      if (result) {
        files[result.path] = result.content;
      }
    }

    const fetched = Math.min(i + batchSize, wikiPaths.length);
    console.log(`  ${fetched}/${wikiPaths.length} fetched`);
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    branch: BRANCH,
    fileCount: Object.keys(files).length,
    files
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));

  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1);
  console.log(
    `Done. Wrote ${output.fileCount} files to ${OUTPUT_PATH} (${sizeKB} KB)`
  );
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
