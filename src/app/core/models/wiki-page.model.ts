export type PageType =
  | 'source'
  | 'entity'
  | 'concept'
  | 'comparison'
  | 'question'
  | 'artifact'
  | 'overview';

export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type MemoryTier = 'working' | 'episodic' | 'semantic' | 'procedural';

export interface Relationship {
  target: string;
  type: string;
}

export interface Frontmatter {
  title: string;
  type: PageType;
  created: string;
  updated: string;
  confidence?: ConfidenceLevel;
  superseded_by?: string;
  supersedes?: string;
  tier?: MemoryTier;
  relationships?: Relationship[];
  sources: string[];
  tags: string[];
}

export const CONFIDENCE_META: Record<ConfidenceLevel, { label: string; color: string; icon: string }> = {
  high: { label: 'High confidence', color: '#2a9d5c', icon: '●' },
  medium: { label: 'Medium confidence', color: '#d4a017', icon: '●' },
  low: { label: 'Low confidence', color: '#c44', icon: '●' }
};

export const TIER_META: Record<MemoryTier, { label: string; color: string; icon: string }> = {
  working: { label: 'Working memory', color: '#888', icon: '⏳' },
  episodic: { label: 'Episodic memory', color: '#6a8caf', icon: '📝' },
  semantic: { label: 'Semantic memory', color: '#2a9d5c', icon: '🧠' },
  procedural: { label: 'Procedural memory', color: '#7b4fc4', icon: '⚙️' }
};

export interface WikiPage {
  slug: string;
  path: string;
  frontmatter: Frontmatter;
  rawMarkdown: string;
  renderedHtml: string;
  outgoingLinks: string[];
}

export interface WikiPageSummary {
  slug: string;
  path: string;
  title: string;
  type: PageType;
  confidence?: ConfidenceLevel;
  tier?: MemoryTier;
  tags: string[];
  summary: string;
  updated: string;
}

export const PAGE_TYPE_META: Record<PageType, { label: string; pluralLabel: string; icon: string; color: string }> = {
  source: { label: 'Source', pluralLabel: 'Sources', icon: '📄', color: 'var(--color-type-source)' },
  entity: { label: 'Entity', pluralLabel: 'Entities', icon: '🏷️', color: 'var(--color-type-entity)' },
  concept: { label: 'Concept', pluralLabel: 'Concepts', icon: '💡', color: 'var(--color-type-concept)' },
  comparison: { label: 'Comparison', pluralLabel: 'Comparisons', icon: '⚖️', color: 'var(--color-type-comparison)' },
  question: { label: 'Question', pluralLabel: 'Questions', icon: '❓', color: 'var(--color-type-question)' },
  artifact: { label: 'Artifact', pluralLabel: 'Artifacts', icon: '📊', color: 'var(--color-type-artifact)' },
  overview: { label: 'Overview', pluralLabel: 'Overviews', icon: '🔭', color: 'var(--color-type-overview)' }
};
