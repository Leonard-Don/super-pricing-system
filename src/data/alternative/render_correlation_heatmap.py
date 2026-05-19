"""Render the provider correlation matrix as a labelled matplotlib heatmap.

The :func:`render_correlation_heatmap` entrypoint takes a
:class:`~src.data.alternative.provider_correlation.CorrelationMatrix`
and writes a PNG to ``results/alt_data/provider_correlation_heatmap.png``
(configurable). The cell colour encodes ``|r_pearson|`` on a blue→red
gradient where blue = independent and red = redundant; cells with too
few overlapping observations (NaN) render in neutral grey so the
viewer can distinguish "honestly empty" from "actually uncorrelated".

Redundancy clusters (single-linkage on |r| > 0.85) are highlighted
with a thick black border drawn around each cluster's row/column
intersection, so a reader can visually pick out which providers form
one "effectively the same source" group.

The renderer is deterministic given the input matrix; it writes the
PNG via a temp file and atomic rename so a half-written file is never
visible to a reader. Matplotlib is the only new dep (already in stack
via ``frontend-design`` / quality gates), and ``matplotlib.use('Agg')``
keeps it headless-safe in CI.
"""

from __future__ import annotations

import logging
import os
import tempfile
from pathlib import Path
from typing import List, Optional

import numpy as np

# Headless backend MUST be selected before pyplot import; otherwise CI
# without a display server crashes on figure creation.
import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402 -- intentional ordering

from .provider_correlation import (
    CorrelationMatrix,
    REDUNDANCY_THRESHOLD,
)

logger = logging.getLogger(__name__)


DEFAULT_OUTPUT_PATH = (
    Path(__file__).resolve().parents[3]
    / "results"
    / "alt_data"
    / "provider_correlation_heatmap.png"
)


def _cluster_index_map(
    providers: List[str],
    clusters: List[set],
) -> dict:
    """Map each provider name to its cluster index for boundary highlighting.

    Cluster indices are assigned in cluster-list order (which the
    detector already sorted deterministically by cluster size desc).
    """

    mapping: dict = {}
    for cluster_idx, cluster in enumerate(clusters):
        for provider in cluster:
            mapping[provider] = cluster_idx
    return mapping


def render_correlation_heatmap(
    matrix: CorrelationMatrix,
    *,
    output_path: Optional[Path] = None,
    title: str = "Cross-Provider Signal Correlation (|r_pearson|)",
    annotate: bool = True,
    redundancy_threshold: float = REDUNDANCY_THRESHOLD,
) -> Path:
    """Write a labelled heatmap PNG for ``matrix``.

    Parameters
    ----------
    matrix
        The :class:`CorrelationMatrix` to render. NaN cells render as
        light grey.
    output_path
        Optional override for the destination PNG. Defaults to
        ``results/alt_data/provider_correlation_heatmap.png``.
    title
        Figure suptitle. Useful for tests that want to disambiguate
        synthetic vs real-data renderings.
    annotate
        When ``True`` (default) each cell shows its numeric ``r`` value
        rounded to 2 decimals. Toggle off when the matrix is too dense
        for legible per-cell annotations.
    redundancy_threshold
        ``|r|`` floor for the "redundant" colour band (red zone). Kept
        in sync with the detector's own threshold.

    Returns
    -------
    Path
        The path the PNG was written to. Useful when tests pass a
        ``tmp_path``-derived destination.
    """

    target = Path(output_path) if output_path else DEFAULT_OUTPUT_PATH
    target.parent.mkdir(parents=True, exist_ok=True)

    providers = list(matrix.providers)
    n = len(providers)
    pearson_abs = np.abs(matrix.pearson_matrix)

    fig, ax = plt.subplots(figsize=(max(8, n * 0.85), max(7, n * 0.75)))

    # ``imshow`` with a diverging cmap so blue → red maps the
    # independent → redundant intuition. ``vmin=0`` / ``vmax=1`` because
    # the values are absolute Pearson values clamped to [0, 1].
    # NaN cells render via the cmap's "bad" colour (we set it to a
    # neutral grey so the viewer can read "missing" at a glance).
    cmap = plt.get_cmap("RdBu_r").copy()
    cmap.set_bad(color="#d0d0d0")

    masked = np.ma.array(pearson_abs, mask=np.isnan(pearson_abs))
    image = ax.imshow(
        masked, cmap=cmap, vmin=0.0, vmax=1.0, aspect="equal"
    )

    # Provider labels on both axes; rotate x for readability.
    ax.set_xticks(np.arange(n))
    ax.set_yticks(np.arange(n))
    ax.set_xticklabels(providers, rotation=45, ha="right")
    ax.set_yticklabels(providers)
    ax.tick_params(axis="both", which="major", labelsize=9)

    # Per-cell annotations -- the numeric |r| value rounded to 2dp,
    # or "n/a" when NaN. Text colour flips to white inside the dark
    # red high-|r| band so the annotation stays legible.
    if annotate:
        for i in range(n):
            for j in range(n):
                value = pearson_abs[i, j]
                if np.isnan(value):
                    text = "n/a"
                    color = "#444444"
                else:
                    text = f"{value:.2f}"
                    color = "white" if value >= 0.55 else "#202020"
                ax.text(
                    j,
                    i,
                    text,
                    ha="center",
                    va="center",
                    fontsize=8,
                    color=color,
                )

    # Highlight redundancy cluster boundaries. For every cluster that
    # has ≥ 2 members we draw a thick rectangle around the block where
    # the cluster members intersect themselves in the matrix grid.
    # Since the matrix is symmetric we only highlight the upper-triangle
    # cells (i ≤ j) to keep the drawing uncluttered.
    cluster_map = _cluster_index_map(providers, matrix.redundancy_clusters)
    for cluster in matrix.redundancy_clusters:
        if len(cluster) < 2:
            continue
        indices = sorted(
            providers.index(p) for p in cluster if p in providers
        )
        for i in indices:
            for j in indices:
                if i >= j:
                    continue
                ax.add_patch(
                    plt.Rectangle(
                        (j - 0.5, i - 0.5),
                        1.0,
                        1.0,
                        fill=False,
                        edgecolor="black",
                        linewidth=2.0,
                    )
                )
                ax.add_patch(
                    plt.Rectangle(
                        (i - 0.5, j - 0.5),
                        1.0,
                        1.0,
                        fill=False,
                        edgecolor="black",
                        linewidth=2.0,
                    )
                )

    # Colorbar with annotated tick marks at the redundancy threshold so
    # the reader can locate "red zone" without squinting.
    cbar = fig.colorbar(image, ax=ax, shrink=0.85, pad=0.02)
    cbar.set_label("|r| (Pearson) — blue=independent, red=redundant", fontsize=10)
    cbar.ax.axhline(
        redundancy_threshold,
        color="black",
        linewidth=1.0,
        linestyle="--",
    )

    # Figure title carries the cluster + average-correlation summary so
    # the PNG stands alone as a one-glance artefact.
    avg = matrix.average_pairwise_correlation
    avg_label = (
        "n/a"
        if (isinstance(avg, float) and np.isnan(avg))
        else f"{avg:.3f}"
    )
    eff = len(matrix.redundancy_clusters)
    subtitle = (
        f"Effective independent providers: {eff}/{n} | "
        f"Avg |r|: {avg_label} | "
        f"Redundancy threshold: |r| > {redundancy_threshold:.2f}"
    )
    ax.set_title(f"{title}\n{subtitle}", fontsize=11, pad=12)

    fig.tight_layout()

    # Atomic write: tempfile + rename. Matches the governance.py pattern.
    file_descriptor, temp_name = tempfile.mkstemp(
        dir=target.parent,
        prefix=f"{target.stem}-",
        suffix=f"{target.suffix}.tmp",
    )
    temp_path = Path(temp_name)
    try:
        os.close(file_descriptor)
        # Explicit ``format="png"`` because the tempfile suffix is
        # ``*.png.tmp`` and matplotlib's filename-based format
        # inference picks ``tmp`` (unsupported) otherwise.
        fig.savefig(temp_path, dpi=120, bbox_inches="tight", format="png")
        temp_path.replace(target)
    finally:
        plt.close(fig)
        temp_path.unlink(missing_ok=True)

    logger.info("Wrote provider correlation heatmap to %s", target)
    return target


__all__ = [
    "DEFAULT_OUTPUT_PATH",
    "render_correlation_heatmap",
]
