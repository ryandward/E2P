import { useState } from "react";

// ── Dataset cards ──

const datasets = [
  { name: "RNA-seq (ENCODE)", samples: 1248, genes: "58,721", status: "Complete" },
  { name: "ChIP-seq H3K27ac", samples: 642, genes: "31,204", status: "Processing" },
  { name: "ATAC-seq (Roadmap)", samples: 387, genes: "22,109", status: "Complete" },
  { name: "Hi-C Contact Maps", samples: 94, genes: "N/A", status: "Pending" },
  { name: "WGBS Methylation", samples: 521, genes: "28,076", status: "Complete" },
  { name: "STARR-seq Enhancers", samples: 156, genes: "12,843", status: "Processing" },
];

export default function Data() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <article className="region center flow">
      <h1>Data</h1>
      <p>This application is built on two core ideas: a <strong>Grammar of Graphics</strong> (GoG) for visualization and <strong>CUBE CSS</strong> for layout and styling.</p>
      <p>The GoG is a declarative system where every chart is described as a <code>PlotSpec</code> — data, aesthetic mappings, scales, and geometry layers. A compiler transforms the spec into a scene graph of scaled coordinates and color values, which a painter renders onto a single GPU-accelerated canvas. The spec is the single source of truth: serializable, portable, and independent of the DOM.</p>
      <p>CUBE CSS (Compositions, Utilities, Blocks, Exceptions) organizes styles into four layers. <strong>Compositions</strong> are reusable geometry primitives — grids, stacks, sidebars — that know nothing about color or typography. <strong>Blocks</strong> are component-scoped visual treatments. <strong>Utilities</strong> are single-purpose classes like <code>.weight-semibold</code> or <code>.promote-layer</code>. <strong>Exceptions</strong> handle state-driven overrides via <code>[data-*]</code> selectors.</p>
      <p>This page has no GoG involvement — it demonstrates pure CUBE CSS layout. Each card composes <code>.card</code> (block), <code>.stack</code> (composition), <code>.engage</code> and <code>.recede</code> (utilities). Selection uses <code>[data-selected]</code> and <code>[data-dimmed]</code> exception selectors — the card itself knows nothing about selection logic.</p>

      <div className="grid">
        {datasets.map((d) => (
          <div
            key={d.name}
            className="card stack engage recede"
            style={{ "--stack-gap": "var(--space-element)" } as React.CSSProperties}
            onClick={() => setSelected(selected === d.name ? null : d.name)}
            {...(selected === d.name ? { "data-selected": "" } : {})}
            {...(selected && selected !== d.name ? { "data-dimmed": "" } : {})}
          >
            <div className="cluster spread">
              <p className="weight-semibold">{d.name}</p>
              <span className="text-label color-muted self-start" style={{ minHeight: "3lh" }}>
                {[
                  ".card",
                  ".engage",
                  ".recede",
                  selected === d.name ? "[data-selected]" : null,
                  selected && selected !== d.name ? "[data-dimmed]" : null,
                ].filter(Boolean).join(" ")}
              </span>
            </div>
            <dl className="stack" style={{ "--stack-gap": "var(--space-1)" } as React.CSSProperties}>
              <div className="cluster spread">
                <dt className="text-caption">Samples</dt>
                <dd>{d.samples.toLocaleString()}</dd>
              </div>
              <div className="cluster spread">
                <dt className="text-caption">Genes</dt>
                <dd>{d.genes}</dd>
              </div>
              <div className="cluster spread">
                <dt className="text-caption">Status</dt>
                <dd
                  className="badge status-tinted radius-control"
                  data-status={d.status.toLowerCase()}
                >{d.status}</dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </article>
  );
}
