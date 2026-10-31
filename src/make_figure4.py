import json, sys
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy import stats


from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # repository root
(ROOT / "out").mkdir(exist_ok=True)
(ROOT / "figs").mkdir(exist_ok=True)

sys.path.insert(0, f"{ROOT}/src")
from metalib import hedges_g, nmd, random_effects, subgroup_test

plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9,
                     "axes.spines.top": False, "axes.spines.right": False,
                     "axes.linewidth": 0.8, "figure.dpi": 160})
INK, ACC, BLU, GREY = "#1a1a1a", "#B4462F", "#2F5F8A", "#8a8a8a"
GRN = "#3F7A5E"
OUT = f"{ROOT}/figs"
R = json.load(open(f"{ROOT}/out/revision_results.json"))

SD = {"SOD1-G93A": 9.0, "SOD1-G93A x EAAT2 tg": 9.0, "TDP-43-A315T": 12.0,
      "FUS(1-359)": 10.0, "TDP-43 tg rat": 12.0}
als = pd.read_csv(f"{ROOT}/data/als_lifespan.csv")
als["sd"] = als.model.map(SD).fillna(9.0)
als["n_treat"] = als.n_treat.fillna(12); als["n_ctrl"] = als.n_ctrl.fillna(12)
als["se_days"] = als.sd * np.sqrt(1/als.n_treat + 1/als.n_ctrl)
is_null = (als.delta_source == "explicit_null").values

fig, axes = plt.subplots(1, 3, figsize=(12.6, 3.9))

# ---- (a) Monte-Carlo sensitivity to the delta = 0 coding --------------------
rng = np.random.default_rng(20260907)
mus, qb = [], []
for _ in range(4000):
    d = als.delta_days.values.astype(float).copy()
    d[is_null] = stats.truncnorm.rvs(-1.96, 1.96, loc=0,
                                     scale=als.se_days.values[is_null],
                                     random_state=rng)
    g = np.empty(len(als)); v = np.empty(len(als))
    for i, (dd, sd, n1, n2) in enumerate(zip(d, als.sd, als.n_treat, als.n_ctrl)):
        g[i], v[i] = hedges_g(dd, sd, n1, n2)
    mus.append(random_effects(g, v, method="REML")["mu"])
    m = als.lab_independent_of_originator.values == 0
    qb.append(subgroup_test([random_effects(g[m], v[m], "DL", False),
                             random_effects(g[~m], v[~m], "DL", False)])[2])
mus, qb = np.array(mus), np.array(qb)

ax = axes[0]
ax.hist(mus, bins=45, color=BLU, alpha=0.80, edgecolor="white", linewidth=0.3)
ax.axvline(0.201, color=ACC, lw=1.6, label="deterministic coding (+0.20)")
ax.axvline(0, color=INK, lw=1.0)
ax.axvline(np.percentile(mus, 2.5), color=GREY, ls="--", lw=0.9)
ax.axvline(np.percentile(mus, 97.5), color=GREY, ls="--", lw=0.9)
ax.set_xlabel("Pooled Hedges' $g$")
ax.set_ylabel("Simulations")
ax.legend(frameon=False, fontsize=7.5, loc="upper right")
ax.set_title("(a) Nulls redrawn from their sampling\ndistribution rather than fixed at zero",
             fontsize=9.5, loc="left")
ax.text(0.02, 0.62, f"subgroup test still\np < 0.05 in {(qb<0.05).mean():.0%}\nof simulations",
        transform=ax.transAxes, fontsize=8, color=GRN, va="top")

# ---- (b) Confounding of independence with year -----------------------------
ax = axes[1]
g0 = [hedges_g(r.delta_days, r.sd, r.n_treat, r.n_ctrl)[0] for _, r in als.iterrows()]
v0 = [hedges_g(r.delta_days, r.sd, r.n_treat, r.n_ctrl)[1] for _, r in als.iterrows()]
als["g"], als["var_g"] = g0, v0
sz = 300 * np.sqrt(min(v0) / np.array(v0))
cols = [ACC if i == 0 else BLU for i in als.lab_independent_of_originator]
ax.scatter(als.year, als.g, s=sz, c=cols, alpha=0.85, edgecolor="white", linewidth=0.6)
xx = np.linspace(1994, 2022, 50)
ax.plot(xx, 0.2279 - 0.0467 * (xx - als.year.mean()), color=GREY, lw=1.2, ls="--")
ax.axhline(0, color=INK, lw=0.9)
ax.set_xlabel("Publication year")
ax.set_ylabel("Hedges' $g$")
ax.set_title("(b) Laboratory independence is confounded\nwith year (r = +0.64, p = 0.024)",
             fontsize=9.5, loc="left")
ax.scatter([], [], s=60, c=ACC, label="originating laboratory")
ax.scatter([], [], s=60, c=BLU, label="independent replication")
ax.legend(frameon=False, fontsize=7.5, loc="upper right")

# ---- (c) Mouse-to-human predictive validity --------------------------------
ax = axes[2]
labels = ["Riluzole\nmouse (originating)", "Riluzole\nmouse (independent)",
          "Riluzole\nHUMAN", "Ceftriaxone\nmouse (originating)", "Ceftriaxone\nHUMAN"]
vals = [9.77, 0.52, 8.0, 7.81, 0.0]
errs = [[0, 1.32, 2.0, 0, 0.0], [0, 1.32, 17.4, 0, 0.0]]
cols3 = [BLU, BLU, GRN, BLU, GRN]
hatch = [None, None, "//", None, "//"]
y = np.arange(len(labels))[::-1]
for i, (vv, cc, hh) in enumerate(zip(vals, cols3, hatch)):
    ax.barh(y[i], vv, color=cc, height=0.6, hatch=hh, edgecolor="white")
ax.errorbar([0.52], [y[1]], xerr=[[1.32], [1.32]], fmt="none", ecolor=INK, capsize=3, lw=1)
ax.errorbar([8.0], [y[2]], xerr=[[2.0], [17.4]], fmt="none", ecolor=INK, capsize=3, lw=1)
ax.set_yticks(y); ax.set_yticklabels(labels, fontsize=7.6)
ax.axvline(0, color=INK, lw=0.9)
ax.set_xlabel("Change in survival (%)")
ax.set_xlim(-3, 30)
ax.set_title("(c) The mouse endpoint erred in\nboth directions", fontsize=9.5, loc="left")
ax.annotate("false negative", xy=(2.2, y[1]), xytext=(11, y[1] - 0.42),
            fontsize=7.6, color=ACC,
            arrowprops=dict(arrowstyle="->", color=ACC, lw=1.0))
ax.annotate("false positive", xy=(7.9, y[3]), xytext=(13, y[3] + 0.40),
            fontsize=7.6, color=ACC,
            arrowprops=dict(arrowstyle="->", color=ACC, lw=1.0))
ax.text(0.35, y[4], "0.0  (null)", fontsize=7.4, color=GRN, va="center")
ax.text(0.35, y[0], f"{vals[0]:.1f}", fontsize=7.4, color="white", va="center", ha="left")
ax.spines["left"].set_visible(False); ax.tick_params(left=False)

plt.tight_layout()
plt.savefig(f"{OUT}/fig4_revision_sensitivity.png", bbox_inches="tight")
print("figure 4 written")
