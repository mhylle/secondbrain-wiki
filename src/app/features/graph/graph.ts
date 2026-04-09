import {
  Component,
  inject,
  signal,
  OnInit,
  OnDestroy,
  ElementRef,
  viewChild,
  AfterViewInit
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import * as d3 from 'd3';

import { PAGE_TYPE_META, PageType } from '../../core/models/wiki-page.model';

interface GraphNode extends d3.SimulationNodeDatum {
  slug: string;
  title: string;
  type: string;
  confidence: string;
  tier: string;
}

interface GraphEdge extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
  type: string;
}

interface GraphData {
  nodeCount: number;
  edgeCount: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

@Component({
  selector: 'app-graph',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './graph.html',
  styleUrl: './graph.css'
})
export class Graph implements OnInit, OnDestroy, AfterViewInit {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly svgRef = viewChild<ElementRef<SVGSVGElement>>('graphSvg');

  readonly loading = signal(true);
  readonly error = signal('');
  readonly nodeCount = signal(0);
  readonly edgeCount = signal(0);
  readonly hoveredNode = signal<GraphNode | null>(null);
  readonly focusSlug = signal<string | null>(null);
  readonly typeMeta = PAGE_TYPE_META;
  readonly legendTypes: PageType[] = ['source', 'entity', 'concept', 'comparison', 'question'];

  private simulation: d3.Simulation<GraphNode, GraphEdge> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  ngOnInit(): void {
    const focus = this.route.snapshot.queryParamMap.get('focus');
    if (focus) this.focusSlug.set(focus);

    this.http.get<GraphData>('assets/graph.json').subscribe({
      next: data => {
        this.nodeCount.set(data.nodeCount);
        this.edgeCount.set(data.edgeCount);
        this.loading.set(false);
        setTimeout(() => this.renderGraph(data), 0);
      },
      error: () => {
        this.error.set('Failed to load graph data. Run `python -m tools.graph` in the secondbrain repo.');
        this.loading.set(false);
      }
    });
  }

  ngAfterViewInit(): void {
    // handled by setTimeout in ngOnInit subscriber
  }

  ngOnDestroy(): void {
    this.simulation?.stop();
    this.resizeObserver?.disconnect();
  }

  private getTypeColor(type: string): string {
    const meta = PAGE_TYPE_META[type as PageType];
    if (!meta) return '#888';
    // resolve CSS variables to actual colors
    const map: Record<string, string> = {
      'var(--color-type-source)': '#5b8a72',
      'var(--color-type-entity)': '#7b6ba5',
      'var(--color-type-concept)': '#c06030',
      'var(--color-type-comparison)': '#4a7c9f',
      'var(--color-type-question)': '#b5883e',
      'var(--color-type-artifact)': '#8b6b5a',
      'var(--color-type-overview)': '#6b7b8a'
    };
    return map[meta.color] || '#888';
  }

  private renderGraph(data: GraphData): void {
    const svgEl = this.svgRef()?.nativeElement;
    if (!svgEl) return;

    const container = svgEl.parentElement!;
    let width = container.clientWidth;
    let height = container.clientHeight;

    const svg = d3.select(svgEl).attr('width', width).attr('height', height);
    svg.selectAll('*').remove();

    // Build node map for edge resolution
    const nodeMap = new Map(data.nodes.map(n => [n.slug, n]));
    const validEdges = data.edges.filter(
      e =>
        nodeMap.has(e.source as string) &&
        nodeMap.has(e.target as string) &&
        e.source !== e.target
    );

    // Deduplicate edges
    const edgeKeys = new Set<string>();
    const edges = validEdges.filter(e => {
      const key = [e.source, e.target].sort().join('|') + '|' + e.type;
      if (edgeKeys.has(key)) return false;
      edgeKeys.add(key);
      return true;
    });

    const nodes: GraphNode[] = data.nodes.map(n => ({ ...n }));

    // Connection count for sizing
    const connCount = new Map<string, number>();
    edges.forEach(e => {
      connCount.set(e.source as string, (connCount.get(e.source as string) || 0) + 1);
      connCount.set(e.target as string, (connCount.get(e.target as string) || 0) + 1);
    });

    const g = svg.append('g');

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform));
    svg.call(zoom);

    // Edge type colors
    const edgeColor = (type: string): string => {
      const map: Record<string, string> = {
        'uses': '#6b9',
        'depends-on': '#c66',
        'extends': '#69c',
        'contradicts': '#c44',
        'caused-by': '#96c',
        'supersedes': '#888',
        'related-to': '#ccc'
      };
      return map[type] || '#ddd';
    };

    // Links
    const link = g
      .append('g')
      .selectAll('line')
      .data(edges)
      .join('line')
      .attr('stroke', d => edgeColor(d.type))
      .attr('stroke-width', d => d.type === 'related-to' ? 0.5 : 1.2)
      .attr('stroke-opacity', d => d.type === 'related-to' ? 0.3 : 0.6);

    // Focus: determine which nodes are neighbors of the focus node
    const focus = this.focusSlug();
    const neighborSlugs = new Set<string>();
    if (focus) {
      neighborSlugs.add(focus);
      edges.forEach(e => {
        const src = e.source as string;
        const tgt = e.target as string;
        if (src === focus) neighborSlugs.add(tgt);
        if (tgt === focus) neighborSlugs.add(src);
      });
    }

    const isFocused = (slug: string) => !focus || neighborSlugs.has(slug);
    const isFocusNode = (slug: string) => focus === slug;

    // Nodes
    const node = g
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => isFocusNode(d.slug) ? 12 : 4 + Math.sqrt(connCount.get(d.slug) || 1) * 2)
      .attr('fill', d => this.getTypeColor(d.type))
      .attr('stroke', d => isFocusNode(d.slug) ? '#c06030' : '#fff')
      .attr('stroke-width', d => isFocusNode(d.slug) ? 3 : 1.5)
      .attr('opacity', d => isFocused(d.slug) ? 1 : 0.15)
      .attr('cursor', 'pointer')
      .on('mouseenter', (_event, d) => this.hoveredNode.set(d))
      .on('mouseleave', () => this.hoveredNode.set(null))
      .on('click', (_event, d) => this.router.navigate(['/wiki', d.slug]))
      .call(
        d3.drag<any, GraphNode>()
          .on('start', (event, d) => {
            if (!event.active) this.simulation?.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) this.simulation?.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Apply focus dimming to links
    if (focus) {
      link.attr('stroke-opacity', d => {
        const src = (d.source as GraphNode).slug ?? d.source as string;
        const tgt = (d.target as GraphNode).slug ?? d.target as string;
        return (src === focus || tgt === focus) ? 0.8 : 0.05;
      });
    }

    // Labels — show for focused neighborhood or high-connection nodes
    const labelThreshold = focus ? 0 : 5;
    const labelNodes = focus
      ? nodes.filter(n => neighborSlugs.has(n.slug))
      : nodes.filter(n => (connCount.get(n.slug) || 0) >= labelThreshold);

    const label = g
      .append('g')
      .selectAll('text')
      .data(labelNodes)
      .join('text')
      .text(d => d.title)
      .attr('font-size', d => isFocusNode(d.slug) ? '12px' : '9px')
      .attr('font-weight', d => isFocusNode(d.slug) ? '600' : '400')
      .attr('font-family', 'var(--font-sans)')
      .attr('fill', '#2c2c2c')
      .attr('pointer-events', 'none')
      .attr('dx', d => 6 + (isFocusNode(d.slug) ? 12 : Math.sqrt(connCount.get(d.slug) || 1) * 2))
      .attr('dy', 3);

    // Simulation
    this.simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink<GraphNode, GraphEdge>(edges).id(d => d.slug).distance(60))
      .force('charge', d3.forceManyBody().strength(-120))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(12))
      .on('tick', () => {
        link
          .attr('x1', d => (d.source as GraphNode).x!)
          .attr('y1', d => (d.source as GraphNode).y!)
          .attr('x2', d => (d.target as GraphNode).x!)
          .attr('y2', d => (d.target as GraphNode).y!);
        node.attr('cx', d => d.x!).attr('cy', d => d.y!);
        label.attr('x', d => d.x!).attr('y', d => d.y!);
      });

    // Zoom to focused node after simulation stabilizes
    if (focus) {
      this.simulation.on('end', () => {
        const focusNode = nodes.find(n => n.slug === focus);
        if (focusNode && focusNode.x != null && focusNode.y != null) {
          const scale = 2;
          const tx = width / 2 - focusNode.x * scale;
          const ty = height / 2 - focusNode.y * scale;
          svg.transition().duration(750).call(
            zoom.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
          );
        }
      });
    }

    // Fit on resize
    this.resizeObserver = new ResizeObserver(() => {
      width = container.clientWidth;
      height = container.clientHeight;
      svg.attr('width', width).attr('height', height);
      this.simulation?.force('center', d3.forceCenter(width / 2, height / 2));
    });
    this.resizeObserver.observe(container);
  }
}
