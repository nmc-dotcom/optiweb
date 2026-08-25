import { useMemo } from "react";
import { useI18n } from "../i18n";
import { useCrawlerStore } from "../features/crawler/useCrawlerStore";
import { buildLinkGraph, type LinkGraphNode } from "../lib/linkGraph";

const WIDTH = 900;
const HEIGHT = 420;
const NODE_RADIUS = 18;

function nodeClass(node: LinkGraphNode): string {
  if (node.isBroken) return "fill-destructive stroke-destructive";
  if (node.isExternal) return "fill-terracotta stroke-terracotta";
  if (node.severity === "warning") return "fill-yellow-500 stroke-yellow-600";
  return "fill-primary stroke-green-deep";
}

function edgeClass(severity: string): string {
  if (severity === "error") return "stroke-destructive";
  if (severity === "warning") return "stroke-yellow-600";
  return "stroke-border";
}

function truncateLabel(label: string): string {
  return label.length > 24 ? `${label.slice(0, 21)}...` : label;
}

export function LinkGraph() {
  const { t } = useI18n();
  const linkResults = useCrawlerStore((s) => s.linkResults);
  const graph = useMemo(() => buildLinkGraph(linkResults), [linkResults]);

  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    const count = graph.nodes.length;
    const radiusX = WIDTH / 2 - 90;
    const radiusY = HEIGHT / 2 - 70;
    graph.nodes.forEach((node, index) => {
      const angle = count <= 1 ? 0 : (Math.PI * 2 * index) / count - Math.PI / 2;
      map.set(node.url, {
        x: WIDTH / 2 + Math.cos(angle) * radiusX,
        y: HEIGHT / 2 + Math.sin(angle) * radiusY,
      });
    });
    return map;
  }, [graph.nodes]);

  if (graph.nodes.length === 0) return null;

  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-foreground">{t("graph.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("graph.summary", {
              nodes: graph.nodes.length,
              edges: graph.edges.length,
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>{t("graph.legend.internal")}</span>
          <span>{t("graph.legend.external")}</span>
          <span>{t("graph.legend.broken")}</span>
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-background">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={t("graph.title")}
          className="block h-auto w-full"
        >
          <defs>
            <marker
              id="arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" className="fill-muted-foreground" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (!source || !target) return null;
            return (
              <line
                key={edge.id}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                markerEnd="url(#arrow)"
                className={`${edgeClass(edge.severity)} opacity-70`}
                strokeWidth={edge.isBroken ? 3 : 1.5}
              />
            );
          })}
          {graph.nodes.map((node) => {
            const position = positions.get(node.url);
            if (!position) return null;
            return (
              <g key={node.url}>
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={NODE_RADIUS + Math.min(node.incoming + node.outgoing, 8)}
                  className={`${nodeClass(node)} stroke-2`}
                >
                  <title>{node.url}</title>
                </circle>
                <text
                  x={position.x}
                  y={position.y + 4}
                  textAnchor="middle"
                  className="fill-primary-foreground text-[10px] font-bold"
                >
                  {node.incoming + node.outgoing}
                </text>
                <text
                  x={position.x}
                  y={position.y + 34}
                  textAnchor="middle"
                  className="fill-foreground text-[11px]"
                >
                  {truncateLabel(node.label)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
