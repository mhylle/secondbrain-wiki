import { Injectable } from '@angular/core';
import { Marked, type TokenizerExtension, type RendererExtension, type Tokens } from 'marked';
import { parse as parseYaml } from 'yaml';

import { Frontmatter } from '../models/wiki-page.model';

interface WikiLinkToken extends Tokens.Generic {
  type: 'wikiLink';
  raw: string;
  slug: string;
  display: string;
}

const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;
const WIKI_LINK_REGEX = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/;
const WIKI_LINK_REGEX_GLOBAL = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g;
const CALLOUT_REGEX = /^<blockquote>\s*<p>\[!(warning|info|note|tip)\]([\s\S]*?)<\/p>\s*<\/blockquote>/gim;

@Injectable({ providedIn: 'root' })
export class MarkdownParserService {
  private readonly marked: Marked;

  constructor() {
    const wikiLinkExtension: TokenizerExtension & RendererExtension = {
      name: 'wikiLink',
      level: 'inline',
      start(src: string): number | undefined {
        return src.indexOf('[[');
      },
      tokenizer(src: string): WikiLinkToken | undefined {
        const match = WIKI_LINK_REGEX.exec(src);
        if (match && src.indexOf(match[0]) === 0) {
          const slug = match[1].trim();
          const display = match[2]?.trim() || slug;
          return {
            type: 'wikiLink',
            raw: match[0],
            slug,
            display
          };
        }
        return undefined;
      },
      renderer(token: Tokens.Generic): string {
        const wikiToken = token as WikiLinkToken;
        const displayText = wikiToken.display
          .replace(/-/g, ' ')
          .replace(/\b\w/g, c => c.toUpperCase());
        return `<a href="/wiki/${wikiToken.slug}" class="wiki-link" data-slug="${wikiToken.slug}">${wikiToken.display === wikiToken.slug ? displayText : wikiToken.display}</a>`;
      }
    };

    this.marked = new Marked({ gfm: true, breaks: false });
    this.marked.use({ extensions: [wikiLinkExtension] });
  }

  parseFrontmatter(rawMarkdown: string): { frontmatter: Frontmatter; body: string } {
    const match = FRONTMATTER_REGEX.exec(rawMarkdown);
    const defaults: Frontmatter = {
      title: '',
      type: 'concept',
      created: '',
      updated: '',
      sources: [],
      tags: []
    };

    if (!match) {
      return { frontmatter: defaults, body: rawMarkdown };
    }

    const parsed = parseYaml(match[1]) as Record<string, unknown>;
    const confidence = parsed['confidence'] as string | undefined;
    const frontmatter: Frontmatter = {
      title: (parsed['title'] as string) || '',
      type: (parsed['type'] as Frontmatter['type']) || 'concept',
      created: (parsed['created'] as string) || '',
      updated: (parsed['updated'] as string) || '',
      confidence: confidence === 'high' || confidence === 'medium' || confidence === 'low' ? confidence : undefined,
      superseded_by: (parsed['superseded_by'] as string) || undefined,
      supersedes: (parsed['supersedes'] as string) || undefined,
      tier: (['working', 'episodic', 'semantic', 'procedural'].includes(parsed['tier'] as string) ? parsed['tier'] as Frontmatter['tier'] : undefined),
      last_accessed: (parsed['last_accessed'] as string) || undefined,
      relationships: Array.isArray(parsed['relationships'])
        ? (parsed['relationships'] as Array<Record<string, string>>)
            .filter(r => r['target'] && r['type'])
            .map(r => ({ target: r['target'], type: r['type'] }))
        : undefined,
      sources: Array.isArray(parsed['sources']) ? parsed['sources'] : [],
      tags: Array.isArray(parsed['tags']) ? parsed['tags'] : []
    };

    const body = rawMarkdown.slice(match[0].length).trim();
    return { frontmatter, body };
  }

  renderToHtml(markdownBody: string): string {
    let html = this.marked.parse(markdownBody) as string;
    html = this.renderCallouts(html);
    return html;
  }

  extractLinks(rawMarkdown: string): string[] {
    const links: string[] = [];
    let match: RegExpExecArray | null;
    const regex = new RegExp(WIKI_LINK_REGEX_GLOBAL);
    while ((match = regex.exec(rawMarkdown)) !== null) {
      links.push(match[1].trim());
    }
    return [...new Set(links)];
  }

  private renderCallouts(html: string): string {
    return html.replace(CALLOUT_REGEX, (_match, type: string, content: string) => {
      const typeClass = type.toLowerCase();
      const label = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
      return `<div class="callout callout--${typeClass}"><span class="callout__label">${label}</span>${content.trim()}</div>`;
    });
  }
}
