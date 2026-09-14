"use client";

import { useState } from "react";

import { Icon } from "../../../../components/icons";

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function DocumentViewer({
  docId,
  label,
  pageCount,
  page,
  onPage,
  flaggedPages,
}: {
  docId: string;
  label: string;
  pageCount: number;
  page: number;
  onPage: (n: number) => void;
  /** 0-based pages that still hold unconfirmed fields. */
  flaggedPages: ReadonlySet<number>;
}) {
  const [zoomIdx, setZoomIdx] = useState(2);
  const [fit, setFit] = useState(true);
  const [rot, setRot] = useState(0);
  const zoom = ZOOMS[zoomIdx];
  const src = (n: number) => `/api/documents/${docId}/image?page=${n}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div className="viewerbar">
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b style={{ fontWeight: 600 }}>{label}</b> <span className="muted">· page {page + 1} of {pageCount}</span>
        </span>
        <span className="row" style={{ gap: 6 }}>
          <button type="button" className="icbtn sm" onClick={() => (setFit(false), setZoomIdx((i) => Math.max(0, i - 1)))} aria-label="Zoom out">
            <Icon name="zoomout" size={14} />
          </button>
          <span className="mono" style={{ width: 40, textAlign: "center" }}>{fit ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
          <button type="button" className="icbtn sm" onClick={() => (setFit(false), setZoomIdx((i) => Math.min(ZOOMS.length - 1, i + 1)))} aria-label="Zoom in">
            <Icon name="zoomin" size={14} />
          </button>
          <button type="button" className={`icbtn sm wide${fit ? "" : ""}`} onClick={() => (setFit(true), setZoomIdx(2))} aria-pressed={fit} style={fit ? { borderColor: "var(--primary)", color: "var(--info-text)" } : undefined}>
            <Icon name="fit" size={14} />
            Fit width
          </button>
          <button type="button" className="icbtn sm" onClick={() => setRot((r) => (r + 90) % 360)} aria-label="Rotate">
            <Icon name="rotate" size={14} />
          </button>
          <button type="button" className="icbtn sm" onClick={() => onPage(Math.max(0, page - 1))} disabled={page === 0} aria-label="Previous page">
            <Icon name="chevl" size={14} />
          </button>
          <button type="button" className="icbtn sm" onClick={() => onPage(Math.min(pageCount - 1, page + 1))} disabled={page >= pageCount - 1} aria-label="Next page">
            <Icon name="chev" size={14} />
          </button>
        </span>
      </div>
      <div className="viewer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={page}
          src={src(page)}
          alt={`${label}, page ${page + 1}`}
          className="viewer-page"
          style={{
            width: fit ? "100%" : `${zoom * 100}%`,
            maxWidth: fit ? "100%" : "none",
            transform: rot ? `rotate(${rot}deg)` : undefined,
          }}
        />
      </div>
      <div className="pagestrip">
        {Array.from({ length: pageCount }, (_, n) => (
          <button key={n} type="button" onClick={() => onPage(n)} aria-label={`Page ${n + 1}`} aria-current={n === page ? "page" : undefined}>
            <span className={`thumb img${n === page ? " selected" : ""}${flaggedPages.has(n) ? " flag" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src(n)} alt="" />
            </span>
          </button>
        ))}
        {flaggedPages.size > 0 && <span className="muted small" style={{ marginLeft: 6 }}>Dot marks a page with unconfirmed fields</span>}
      </div>
    </div>
  );
}
