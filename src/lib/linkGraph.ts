import type { IssueSeverity, LinkResult } from "../types";

export interface LinkGraphNode {
  url: string;
  label: string;
  isExternal: boolean;
  isBroken: boolean;
  severity: IssueSeverity;
  incoming: number;
  outgoing: number;
}

export interface LinkGraphEdge {
  id: string;
  source: string;
  target: string;
  severity: IssueSeverity;
  isBroken: boolean;
  isExternal: boolean;
}

export interface LinkGraph {
  nodes: LinkGraphNode[];
  edges: LinkGraphEdge[];
}

function severityRank(severity: IssueSeverity): number {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function highestSeverity(a: IssueSeverity, b: IssueSeverity): IssueSeverity {
  return severityRank(a) >= severityRank(b) ? a : b;
}

function labelForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    return path === "/" ? parsed.hostname : path;
  } catch {
    return url;
  }
}

function ensureNode(
  nodes: Map<string, LinkGraphNode>,
  url: string,
  patch: Partial<Pick<LinkGraphNode, "isExternal" | "isBroken" | "severity">> = {},
): LinkGraphNode {
  const current = nodes.get(url);
  if (current) {
    current.isExternal = current.isExternal || Boolean(patch.isExternal);
    current.isBroken = current.isBroken || Boolean(patch.isBroken);
    if (patch.severity) current.severity = highestSeverity(current.severity, patch.severity);
    return current;
  }

  const node: LinkGraphNode = {
    url,
    label: labelForUrl(url),
    isExternal: Boolean(patch.isExternal),
    isBroken: Boolean(patch.isBroken),
    severity: patch.severity ?? "info",
    incoming: 0,
    outgoing: 0,
  };
  nodes.set(url, node);
  return node;
}

export function buildLinkGraph(linkResults: LinkResult[]): LinkGraph {
  const nodes = new Map<string, LinkGraphNode>();
  const edges: LinkGraphEdge[] = [];
  const seenEdges = new Set<string>();

  for (const link of linkResults) {
    if (link.resourceType !== "page") continue;
    ensureNode(nodes, link.targetUrl, {
      isExternal: link.isExternal,
      isBroken: link.isBroken,
      severity: link.severity,
    });

    if (!link.sourceUrl) continue;
    ensureNode(nodes, link.sourceUrl);
    const edgeKey = `${link.sourceUrl}->${link.targetUrl}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({
      id: `edge-${link.id}`,
      source: link.sourceUrl,
      target: link.targetUrl,
      severity: link.severity,
      isBroken: link.isBroken,
      isExternal: link.isExternal,
    });
  }

  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source) source.outgoing += 1;
    if (target) target.incoming += 1;
  }

  return { nodes: [...nodes.values()], edges };
}
