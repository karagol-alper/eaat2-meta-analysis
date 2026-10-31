import sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D


from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # repository root
(ROOT / "out").mkdir(exist_ok=True)
(ROOT / "figs").mkdir(exist_ok=True)

sys.path.insert(0, f"{ROOT}/src")
from metalib import random_effects, power_two_sample, g_for_power, excess_significance

plt.rcParams.update({
    "font.family": "DejaVu Sans", "font.size": 9,
    "axes.spines.top": False, "axes.spines.right": False,
    "axes.linewidth": 0.8, "figure.dpi": 160,
})

INK = "#1a1a1a"; ACC = "#B4462F"; BLU = "#2F5F8A"; GREY = "#8a8a8a"; LGREY = "#d8d8d8"
OUT = f"{ROOT}/figs"

als = pd.read_csv(f"{ROOT}/out/als_effect_sizes.csv")
pdd = pd.read_csv(f"{ROOT}/data/pd_dopaminergic.csv")
pdd = pdd[pdd.stratum == "efficacy"]   # exclude the reclassified dysbiosis experiment

# ---------------------------------------------------------------- FIGURE 1
# Forest plot, ordered by subgroup (originating vs independent)
orig = als[als.lab_independent_of_originator == 0].sort_values("year")
indep = als[als.lab_independent_of_originator == 1].sort_values("year")

r_orig = random_effects(orig.g.values, orig.var_g.values, method="DL", knapp_hartung=False)
r_indep = random_effects(indep.g.values, indep.var_g.values, method="DL", knapp_hartung=False)
r_all = random_effects(als.g.values, als.var_g.values, method="REML")

rows = []
rows.append(("HDR", "Originating / non-independent laboratory", None))
for _, r in orig.iterrows():
    rows.append(("STUDY", r, None))
rows.append(("DIAM", "Subgroup summary", r_orig))
rows.append(("GAP", "", None))
rows.append(("HDR", "Independent replication", None))
for _, r in indep.iterrows():
    rows.append(("STUDY", r, None))
rows.append(("DIAM", "Subgroup summary", r_indep))
rows.append(("GAP", "", None))
rows.append(("DIAM2", "Overall (REML, Knapp-Hartung)", r_all))

fig, ax = plt.subplots(figsize=(9.3, 7.0))
ypos = len(rows)
ytick, ylab = [], []
wmax = als.var_g.min()

for kind, item, res in rows:
    ypos -= 1
    if kind == "GAP":
        continue
    if kind == "HDR":
        ax.text(-2.30, ypos, item, fontsize=9, fontweight="bold",
                va="center", ha="left", color=INK)
        continue
    if kind in ("DIAM", "DIAM2"):
        mu, lo, hi = res["mu"], res["ci_low"], res["ci_high"]
        h = 0.30 if kind == "DIAM2" else 0.24
        col = INK if kind == "DIAM2" else BLU
        ax.add_patch(plt.Polygon([[lo, ypos], [mu, ypos + h], [hi, ypos],
                                  [mu, ypos - h]], closed=True,
                                 facecolor=col, edgecolor=col, alpha=0.9))
        ax.text(-2.30, ypos, f"{item}  (k={res['k']})", fontsize=8.5,
                fontweight="bold" if kind == "DIAM2" else "normal",
                va="center", ha="left", color=INK)
        ax.text(3.50, ypos, f"{mu:+.2f} [{lo:+.2f}, {hi:+.2f}]", fontsize=8.5,
                va="center", ha="right", fontweight="bold" if kind == "DIAM2" else "normal")
        continue

    r = item
    size = 26 * np.sqrt(wmax / r.var_g)
    col = ACC if r.sig_positive == 1 else BLU
    ax.plot([r.ci_lo, r.ci_hi], [ypos, ypos], color=col, lw=1.1, zorder=2)
    ax.scatter([r.g], [ypos], s=size, color=col, zorder=3,
               marker="s", edgecolor="white", linewidth=0.5)
    lbl = f"{r.first_author} {r.year}  ·  {r.agent}  ·  {r.model}"
    ax.text(-2.30, ypos, lbl, fontsize=8, va="center", ha="left", color=INK)
    ax.text(3.50, ypos, f"{r.g:+.2f} [{r.ci_lo:+.2f}, {r.ci_hi:+.2f}]",
            fontsize=7.6, va="center", ha="right", color="#444")
    ax.text(3.88, ypos, r.provenance_tier, fontsize=7.2, va="center",
            ha="center", color=GREY)

ax.axvline(0, color=INK, lw=0.9, zorder=1)
ax.axvline(r_all["mu"], color=GREY, lw=0.8, ls=":", zorder=1)
ax.set_xlim(-2.35, 4.05)
ax.set_ylim(-1.2, len(rows) - 0.2)
ax.set_yticks([])
ax.spines["left"].set_visible(False)
ax.set_xticks([-1, -0.5, 0, 0.5, 1, 1.5, 2])
ax.set_xlabel("Hedges' $g$ for lifespan (favours control  ←   |   →  favours EAAT2 up-regulation)")
ax.text(3.50, len(rows) - 0.6, "g [95% CI]", fontsize=8, ha="right", fontweight="bold")
ax.text(3.88, len(rows) - 0.6, "tier", fontsize=8, ha="center", fontweight="bold", color=GREY)
ax.set_title("Effect of EAAT2 up-regulation on lifespan in rodent models of ALS\n"
             f"Between-subgroup Q = 11.77, df = 1, p = 0.0006",
             fontsize=10.5, loc="left", pad=12)
ax.legend(handles=[Line2D([], [], marker="s", ls="", color=ACC, label="reported as significant"),
                   Line2D([], [], marker="s", ls="", color=BLU, label="null result")],
          frameon=False, fontsize=8, loc="lower right", bbox_to_anchor=(1.0, -0.06))
plt.tight_layout()
plt.savefig(f"{OUT}/fig1_forest_als.png", bbox_inches="tight")
plt.close()

# ---------------------------------------------------------------- FIGURE 2
# Cumulative meta-analysis (decline effect) + funnel
fig, axes = plt.subplots(1, 2, figsize=(10.4, 4.3))

alsy = als.sort_values("year").reset_index(drop=True)
cum = []
for i in range(len(alsy)):
    sl = alsy.iloc[: i + 1]
    if len(sl) == 1:
        gi = float(sl.g.iloc[0]); si = float(sl.se_g.iloc[0])
        cum.append((int(sl.year.iloc[-1]), gi, gi - 1.96 * si, gi + 1.96 * si, sl.study_id.iloc[-1]))
    else:
        rr = random_effects(sl.g.values, sl.var_g.values, method="DL", knapp_hartung=False)
        cum.append((int(sl.year.iloc[-1]), rr["mu"], rr["ci_low"], rr["ci_high"], sl.study_id.iloc[-1]))

ax = axes[0]
yy = np.arange(len(cum))[::-1]
for i, (yr, mu, lo, hi, lab) in enumerate(cum):
    y = yy[i]
    ax.plot([lo, hi], [y, y], color=BLU, lw=1.1)
    ax.scatter([mu], [y], s=26, color=BLU, zorder=3)
    ax.text(-1.15, y, f"{lab.split('_')[0][:4]}… {yr}", fontsize=7, va="center", ha="left", color="#555")
ax.axvline(0, color=INK, lw=0.9)
ax.set_yticks([])
ax.spines["left"].set_visible(False)
ax.set_xlim(-1.2, 2.4)
ax.set_xlabel("Cumulative pooled Hedges' $g$")
ax.set_title("Cumulative meta-analysis: the effect shrinks\nas independent replications accrue",
             fontsize=10, loc="left")
ax.annotate("", xy=(0.21, 0.4), xytext=(1.34, 11.0),
            arrowprops=dict(arrowstyle="->", color=ACC, lw=1.3,
                            connectionstyle="arc3,rad=0.25"))
ax.text(1.15, 6.0, "g: 1.34 → 0.21\n(−84%)", fontsize=8.5, color=ACC, ha="center")

ax = axes[1]
prec = 1.0 / als.se_g.values
ax.scatter(als.g.values, als.se_g.values,
           s=34, c=[ACC if s == 1 else BLU for s in als.sig_positive],
           edgecolor="white", linewidth=0.5, zorder=3)
mu = r_all["mu"]
se_rng = np.linspace(0.001, als.se_g.max() * 1.15, 100)
ax.plot(mu + 1.96 * se_rng, se_rng, color=GREY, lw=0.8, ls="--")
ax.plot(mu - 1.96 * se_rng, se_rng, color=GREY, lw=0.8, ls="--")
ax.axvline(mu, color=GREY, lw=0.8, ls=":")
ax.axvline(0, color=INK, lw=0.9)
ax.invert_yaxis()
ax.set_xlabel("Hedges' $g$")
ax.set_ylabel("Standard error")
ax.set_title("Funnel plot\nEgger intercept +3.42, p = 0.115 (k = 12, low power)",
             fontsize=10, loc="left")
plt.tight_layout()
plt.savefig(f"{OUT}/fig2_cumulative_funnel.png", bbox_inches="tight")
plt.close()

# ---------------------------------------------------------------- FIGURE 3
# PD stratum: power curves and excess significance
fig, axes = plt.subplots(1, 3, figsize=(12.4, 3.9))

# 3a: power vs true effect at the observed sample sizes
ax = axes[0]
gs = np.linspace(0.05, 3.0, 200)
for n, style in [(6, ":"), (8, "-"), (10, "--"), (12, "-.")]:
    pw = [power_two_sample(gg, n, n) for gg in gs]
    ax.plot(gs, pw, style, color=BLU if n != 8 else ACC,
            lw=1.8 if n == 8 else 1.0, label=f"n = {n}/group")
ax.axhline(0.8, color=GREY, lw=0.8, ls=":")
ax.axhline(0.999, color=ACC, lw=0.9, ls="--")
ax.text(2.95, 0.955, "observed positivity 14/14", fontsize=7.5,
        color=ACC, ha="right")
ax.text(2.95, 0.82, "80% power", fontsize=7.5, color=GREY, ha="right")
ax.axvline(2.73, color=ACC, lw=0.9, ls="-", alpha=0.5)
ax.text(2.77, 0.20, "g ≥ 2.73 required", fontsize=8, color=ACC, rotation=90, va="bottom")
ax.set_xlabel("True standardised effect $g$")
ax.set_ylabel("Statistical power")
ax.set_ylim(0, 1.02)
ax.legend(frameon=False, fontsize=7.5, loc="lower right")
ax.set_title("(a) Power of the PD experiments", fontsize=9.5, loc="left")

# 3b: excess significance
ax = axes[1]
gtrue = [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]
E, P = [], []
n_pg = pdd.n_per_group_typ.values
for gt in gtrue:
    t = excess_significance(14, n_pg, n_pg, gt)
    E.append(t["E"]); P.append(t["p"])
x = np.arange(len(gtrue))
ax.bar(x - 0.19, E, width=0.36, color=BLU, label="expected positives")
ax.bar(x + 0.19, [14] * len(gtrue), width=0.36, color=ACC, label="observed positives")
for i, p in enumerate(P):
    txt = "p<0.001" if p < 0.001 else f"p={p:.2f}"
    ax.text(i, 15.1, txt, fontsize=7.2, ha="center",
            color=ACC if p < 0.05 else GREY)
ax.set_xticks(x); ax.set_xticklabels([f"{g:.1f}" for g in gtrue])
ax.set_xlabel("Assumed true effect $g$")
ax.set_ylabel("Number of 'positive' studies")
ax.set_ylim(0, 17.5)
ax.legend(frameon=False, fontsize=7.5, loc="upper left")
ax.set_title("(b) Test of excess significance (k = 14)", fontsize=9.5, loc="left")

# 3c: outcome-domain dissociation (counts read from data/outcome_domains.csv)
ax = axes[2]
od = pd.read_csv(f"{ROOT}/data/outcome_domains.csv")
od["rate"] = od.n_positive / od.n_assessed
short = ["Target\nengagement", "Histological\nneuroprotection",
         "Motor /\nstrength", "Disease\nonset", "Lifespan"]
cmap = [ACC, ACC, "#C98A5E", BLU, BLU]
ypos_c = np.arange(len(od))[::-1]
ax.barh(ypos_c, od.rate.values, color=cmap, height=0.62)
ax.set_yticks(ypos_c); ax.set_yticklabels(short, fontsize=8)
ax.set_xlim(0, 1.28)
ax.set_xlabel("Proportion of assessments reporting benefit")
ax.set_title("(c) Benefit attenuates along the\ncausal chain to survival", fontsize=9.5, loc="left")
for i, r in od.iterrows():
    ax.text(r.rate + 0.03, ypos_c[i], f"{r.n_positive}/{r.n_assessed}",
            fontsize=7.5, va="center", color="#555")
ax.spines["left"].set_visible(False)
ax.tick_params(left=False)

plt.tight_layout()
plt.savefig(f"{OUT}/fig3_pd_bias_dissociation.png", bbox_inches="tight")
plt.close()

print("figures written")
