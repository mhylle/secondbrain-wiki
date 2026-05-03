#!/usr/bin/env node

/**
 * Local-filesystem version of fetch-wiki.mjs.
 *
 * Reads wiki/*.md, .state/graph.json, and .state/search-index.json from the
 * sibling secondbrain repo on disk (no GitHub token required) and writes the
 * same output shape as the GitHub version into public/assets/.
 *
 * Usage:
 *   node tools/fetch-wiki-local.mjs                 # autodetect: sibling ../secondbrain
 *   SECONDBRAIN_PATH=/path/to/secondbrain node tools/fetch-wiki-local.mjs
 *
 * Why this exists: the chat panel cites pages by [[slug]] from the live wiki,
 * but the viewer renders against a static snapshot. If the snapshot is stale,
 * citations become broken links. This script regenerates the snapshot from the
 * local working copy in seconds, without round-tripping through GitHub.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, readdirSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIEWER_ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = join(VIEWER_ROOT, 'public/assets/wiki-data.json');
const GRAPH_OUTPUT_PATH = join(VIEWER_ROOT, 'public/assets/graph.json');
const SEARCH_OUTPUT_PATH = join(VIEWER_ROOT, 'public/assets/search-index.json');

function detectSecondbrainRoot() {
  const explicit = process.env.SECONDBRAIN_PATH;
  if (explicit) return resolve(explicit);

  const candidates = [
    resolve(VIEWER_ROOT, '..', 'secondbrain'),
    resolve(VIEWER_ROOT, '..', '..', 'secondbrain'),
  ];
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'wiki')) && existsSync(join(candidate, 'CLAUDE.md'))) {
      return candidate;
    }
  }
  return null;
}

function walkMarkdown(dir, baseDir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdown(full, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(relative(baseDir, full).replace(/\\/g, '/'));
    }
  }
  return out;
}

function main() {
  const sbRoot = detectSecondbrainRoot();
  if (!sbRoot) {
    console.error(
      'ERROR: could not find the secondbrain repo. Set SECONDBRAIN_PATH or place ' +
        'the secondbrain repo as a sibling of secondbrain-wiki.',
    );
    process.exit(1);
  }
  console.log(`[fetch-wiki-local] sourcing from ${sbRoot}`);

  const wikiDir = join(sbRoot, 'wiki');
  const wikiPaths = walkMarkdown(wikiDir, sbRoot);
  console.log(`[fetch-wiki-local] found ${wikiPaths.length} wiki files`);

  const files = {};
  for (const relPath of wikiPaths) {
    const abs = join(sbRoot, relPath);
    files[relPath] = readFileSync(abs, 'utf-8');
  }

  const output = {
    fetchedAt: new Date().toISOString(),
    branch: 'local',
    fileCount: Object.keys(files).length,
    files,
  };

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output));
  const sizeKB = (Buffer.byteLength(JSON.stringify(output)) / 1024).toFixed(1);
  console.log(`[fetch-wiki-local] wrote ${output.fileCount} files → ${OUTPUT_PATH} (${sizeKB} KB)`);

  // graph.json
  const graphSrc = join(sbRoot, '.state/graph.json');
  if (existsSync(graphSrc)) {
    const text = readFileSync(graphSrc, 'utf-8');
    mkdirSync(dirname(GRAPH_OUTPUT_PATH), { recursive: true });
    writeFileSync(GRAPH_OUTPUT_PATH, text);
    const sizeKB = (statSync(graphSrc).size / 1024).toFixed(1);
    console.log(`[fetch-wiki-local] copied graph.json → ${GRAPH_OUTPUT_PATH} (${sizeKB} KB)`);
  } else {
    console.warn(`[fetch-wiki-local] WARN: ${graphSrc} not found — run 'uv run python tools/graph.py' in the secondbrain repo`);
  }

  // search-index.json
  const searchSrc = join(sbRoot, '.state/search-index.json');
  if (existsSync(searchSrc)) {
    const text = readFileSync(searchSrc, 'utf-8');
    mkdirSync(dirname(SEARCH_OUTPUT_PATH), { recursive: true });
    writeFileSync(SEARCH_OUTPUT_PATH, text);
    const sizeKB = (statSync(searchSrc).size / 1024).toFixed(1);
    console.log(`[fetch-wiki-local] copied search-index.json → ${SEARCH_OUTPUT_PATH} (${sizeKB} KB)`);
  } else {
    console.warn(`[fetch-wiki-local] WARN: ${searchSrc} not found — run the compile step in secondbrain`);
  }
}

main();
