# EAAT2 up-regulators in rodent ALS and Parkinson's disease models

Systematic review and meta-analysis. This repository contains the complete
dataset, the analysis code, the figure generation, and the manuscript build.
Every number in the manuscript regenerates from `make all`.

**Manuscript.** *EAAT2 up-regulation preserves neurons without extending lifespan,
and the murine survival endpoint is discordant with clinical outcome: a systematic
review and meta-analysis in ALS and Parkinson's disease.*
A. Karagöl, T. Karagöl.

---

## Quick start

```bash
pip install -r requirements.txt
npm install
make all
```

Outputs land in `out/` (results, logs, `.docx`) and `figs/` (PNG figures).

---

## Layout

```
data/        study-level extractions, one row per comparison (hand-curated)
src/         analysis, figures, manuscript build
out/         generated: results JSON, logs, effect sizes, .docx   [gitignored]
figs/        generated: figures                                   [gitignored]
```

### Data files

| File | Contents |
|---|---|
| `als_lifespan.csv` | 12 ALS lifespan comparisons from 10 studies. Effect magnitude, group sizes, laboratory independence, provenance tier. |
| `pd_dopaminergic.csv` | 15 PD reports (14 efficacy + 1 reclassified as a safety observation). Model, species, outcome, direction, research group, route. |
| `outcome_domains.csv` | Endpoint-hierarchy tally with the study attribution behind each count. |
| `als_design_features.csv` | Design features determinable from retrieved records (randomisation, blinding, treatment timing). |

### Source files

| File | Role |
|---|---|
| `metalib.py` | Meta-analytic estimators implemented from source equations (no meta-analysis package). Hedges' *g*, DerSimonian–Laird / Paule–Mandel / REML τ², Knapp–Hartung, Egger, trim-and-fill, power, Ioannidis–Trikalinos excess significance. |
| `run_analysis.py` | Primary analysis: pooled lifespan effect, subgroups, cumulative, bias diagnostics, sensitivity, leave-one-out, PD excess significance. |
| `revision_analyses.py` | R1 Monte-Carlo sensitivity to null coding · R2 year/independence confounding · R3 mouse-to-human concordance · R4 exclusion of a clinically meaningful effect · R5 agent evidence density · R6 PD clustering sensitivity · R7 two-agent bound. |
| `make_figures.py` | Figures 1 and 2, and Supplementary Figure S1. |
| `make_figure4.py` | Figure 3 (sensitivity, confounding, predictive validity). |
| `build_manuscript.js` | Builds `EAAT2_manuscript.docx` and `EAAT2_supplementary.docx` with docx-js. Submission formatting: US Letter, Times New Roman 12 pt, double-spaced, continuous line numbers, page numbers, repeating table headers. |

---

## Run order

The targets are sequential; `make all` handles it.

```
run_analysis.py        ->  out/results.json, out/als_effect_sizes.csv
revision_analyses.py   ->  out/revision_results.json
make_figures.py        ->  figs/fig1..fig3        (needs als_effect_sizes.csv)
make_figure4.py        ->  figs/fig4              (needs revision_results.json)
build_manuscript.js    ->  out/*.docx             (needs all figures)
```

Individual targets: `make analysis`, `make figures`, `make manuscript`, `make clean`.

---

## Correcting an extraction

Edit the relevant row in `data/`, then `make all`. Every downstream estimate,
figure, sensitivity analysis and manuscript table updates automatically.

Each row carries a **provenance tier**:

- **A** — direction, significance and group sizes retrieved verbatim from the source or abstract.
- **B** — effect magnitude from the source or an explicit numerical restatement; group sizes imputed.
- **C** — direction known, magnitude inferred from context.

Two Tier B entries (Gurney 1996, Rothstein 2005 effect magnitudes) are outstanding
and should be re-extracted from the original figures before publication. Both are
positive studies, so correcting them can only move the pooled estimate downward.

---

## Reproducibility notes

- Estimators are implemented from published equations rather than called from a
  package, so each reported quantity traces to a formula in `metalib.py`.
- Monte-Carlo analyses use `numpy.random.default_rng(20260907)` and the
  Clopper–Pearson / truncated-normal routines in `scipy.stats`; results are
  deterministic given that seed.
- `build_manuscript.js` pins no fonts beyond Times New Roman; rendering was
  verified through LibreOffice to PDF.

---

## Requirements

Python ≥ 3.10 with numpy, scipy, pandas, matplotlib, Pillow.
Node ≥ 18 with `docx` (see `package.json`).

---

## Citation

Preliminary findings were presented as a late-breaking abstract at the Society
for Neuroscience annual meeting, 2026.

## License

Code: MIT. Extracted data are summary statistics from the cited primary
literature; see the manuscript reference list for sources.
