import { useState } from "react";

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
      <p>Raw datasets, sample metadata, and quality metrics.</p>
      <p className="text-caption">Example data with live CUBE CSS styles</p>

      <div className="grid">
        {datasets.map((d, i) => (
          <div
            key={d.name}
            className="card engage dismiss"
            onClick={() => setSelected(selected === d.name ? null : d.name)}
            {...(selected === d.name ? { "data-selected": "" } : {})}
            {...(selected && selected !== d.name ? { "data-dimmed": "" } : {})}
          >
            <div className="cluster" style={{ justifyContent: "space-between", marginBottom: "var(--space-element)" }}>
              <p className="weight-semibold">{d.name}</p>
              <span className="text-label color-muted" style={{ minHeight: "3lh", display: "flex", alignItems: "start" }}>
                {[
                  ".card",
                  ".engage",
                  ".dismiss",
                  selected === d.name ? "[data-selected]" : null,
                  selected && selected !== d.name ? "[data-dimmed]" : null,
                ].filter(Boolean).join(" ")}
              </span>
            </div>
            <dl className="stack" style={{ gap: "var(--space-1)" }}>
              <div className="cluster" style={{ justifyContent: "space-between" }}>
                <dt className="text-caption">Samples</dt>
                <dd>{d.samples.toLocaleString()}</dd>
              </div>
              <div className="cluster" style={{ justifyContent: "space-between" }}>
                <dt className="text-caption">Genes</dt>
                <dd>{d.genes}</dd>
              </div>
              <div className="cluster" style={{ justifyContent: "space-between" }}>
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
