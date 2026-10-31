"""Primary analysis pipeline for the EAAT2-upregulator preclinical meta-analysis."""

import json
import sys
import numpy as np
import pandas as pd


from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # repository root
(ROOT / "out").mkdir(exist_ok=True)
(ROOT / "figs").mkdir(exist_ok=True)

sys.path.insert(0, f"{ROOT}/src")
from metalib import (hedges_g, nmd, random_effects, subgroup_test, egger,
                     trim_and_fill, power_two_sample, g_for_power, n_for_power,
                     excess_significance)

DATA = f"{ROOT}/data"
OUT = f"{ROOT}/out"

# Model-specific control SD for survival duration (days).
# Anchored on published SOD1-G93A survival dispersion: Heiman-Patterson (2005)
# reported SD 9.5-12.4 d in B6SJL colonies; ALS-TDI design work reports ~8-10 d.
SD_SURVIVAL = {"SOD1-G93A": 9.0, "SOD1-G93A x EAAT2 tg": 9.0,
               "TDP-43-A315T": 12.0, "FUS(1-359)": 10.0, "TDP-43 tg rat": 12.0}
N_IMPUTED = 12          # median per-group n in the SOD1-G93A therapy literature
ALPHA = 0.05

results = {}


# ============================================================================
# A. ALS LIFESPAN STRATUM
# ============================================================================
als = pd.read_csv(f"{DATA}/als_lifespan.csv")
als["sd"] = als["model"].map(SD_SURVIVAL).fillna(9.0)
als["n_treat"] = als["n_treat"].fillna(N_IMPUTED)
als["n_ctrl"] = als["n_ctrl"].fillna(N_IMPUTED)

g, vg, pct, vpct = [], [], [], []
for _, r in als.iterrows():
    gi, vi = hedges_g(r.delta_days, r.sd, r.n_treat, r.n_ctrl)
    g.append(gi); vg.append(vi)
    pi, vpi = nmd(r.ctrl_mean_days + r.delta_days, r.ctrl_mean_days,
                  r.sd, r.n_treat, r.n_ctrl)
    pct.append(pi); vpct.append(vpi)
als["g"], als["var_g"] = g, vg
als["pct"], als["var_pct"] = pct, vpct
als["se_g"] = np.sqrt(als.var_g)
als["ci_lo"] = als.g - 1.96 * als.se_g
als["ci_hi"] = als.g + 1.96 * als.se_g

print("=" * 78)
print("A.  ALS LIFESPAN STRATUM  (k = %d)" % len(als))
print("=" * 78)
print(als[["study_id", "agent", "model", "delta_days", "g", "se_g",
           "sig_positive", "lab_independent_of_originator",
           "provenance_tier"]].to_string(index=False))

overall = random_effects(als.g.values, als.var_g.values, method="REML")
overall_dl = random_effects(als.g.values, als.var_g.values, method="DL")
overall_pm = random_effects(als.g.values, als.var_g.values, method="PM")
overall_pct = random_effects(als.pct.values, als.var_pct.values, method="REML")

print("\n--- Pooled effect on lifespan (Hedges' g, random effects) ---")
for nm, r in [("REML+KH", overall), ("DL", overall_dl), ("Paule-Mandel", overall_pm)]:
    print(f"  {nm:14s} g = {r['mu']:+.3f}  95% CI [{r['ci_low']:+.3f}, {r['ci_high']:+.3f}]"
          f"  p = {r['p']:.3f}   tau2 = {r['tau2']:.3f}  I2 = {r['I2']:.1f}%")
print(f"  95% prediction interval: [{overall['pred_low']:+.3f}, {overall['pred_high']:+.3f}]")
print(f"  Cochran Q = {overall['Q']:.2f} (df={overall['df']}), p = {overall['p_Q']:.4f}")
print(f"\n  Pooled survival change  = {overall_pct['mu']:+.2f}%  "
      f"95% CI [{overall_pct['ci_low']:+.2f}%, {overall_pct['ci_high']:+.2f}%]  "
      f"p = {overall_pct['p']:.3f}")

def _num(d):
    return {k: float(v) for k, v in d.items()
            if isinstance(v, (int, float, np.floating, np.integer))
            and not isinstance(v, bool)}

results["als_overall_g"] = _num(overall)
results["als_overall_pct"] = _num(overall_pct)

# ---- Subgroup: originating vs independent laboratory ----------------------
print("\n--- Subgroup: originating laboratory vs independent replication ---")
sub = {}
for lab, lbl in [(0, "Originating / non-independent"), (1, "Independent replication")]:
    m = als.lab_independent_of_originator == lab
    if m.sum() >= 2:
        r = random_effects(als.g[m].values, als.var_g[m].values,
                           method="REML", knapp_hartung=False)
    else:
        r = random_effects(als.g[m].values, als.var_g[m].values,
                           method="DL", knapp_hartung=False)
    sub[lbl] = r
    print(f"  {lbl:32s} k={r['k']:2d}  g = {r['mu']:+.3f} "
          f"[{r['ci_low']:+.3f}, {r['ci_high']:+.3f}]  I2={r['I2']:.0f}%")
Qb, dfb, pb = subgroup_test(list(sub.values()))
print(f"  Between-subgroup Q = {Qb:.2f} (df={dfb}), p = {pb:.5f}")
results["als_subgroup_lab"] = {"Qb": float(Qb), "df": int(dfb), "p": float(pb),
                               **{k: float(v["mu"]) for k, v in sub.items()}}

# ---- Subgroup: pharmacological vs genetic --------------------------------
print("\n--- Subgroup: pharmacological up-regulation vs genetic overexpression ---")
sub2 = {}
for route in ["pharmacological", "genetic_overexpression"]:
    m = als.mechanism_route == route
    r = random_effects(als.g[m].values, als.var_g[m].values,
                       method="DL", knapp_hartung=False)
    sub2[route] = r
    print(f"  {route:26s} k={r['k']:2d}  g = {r['mu']:+.3f} "
          f"[{r['ci_low']:+.3f}, {r['ci_high']:+.3f}]")

# ---- Agent-level ---------------------------------------------------------
print("\n--- Agent-level pooled estimates ---")
agent_res = {}
for agent in ["Riluzole", "Ceftriaxone", "EAAT2 transgene", "LV-EAAT2 (alone)"]:
    m = als.agent == agent
    if m.sum() == 0:
        continue
    if m.sum() == 1:
        gi = float(als.g[m].iloc[0]); si = float(als.se_g[m].iloc[0])
        print(f"  {agent:20s} k= 1  g = {gi:+.3f} [{gi-1.96*si:+.3f}, {gi+1.96*si:+.3f}]  (single study)")
        agent_res[agent] = {"k": 1, "mu": gi, "ci_low": gi-1.96*si, "ci_high": gi+1.96*si}
    else:
        r = random_effects(als.g[m].values, als.var_g[m].values,
                           method="DL", knapp_hartung=False)
        print(f"  {agent:20s} k={r['k']:2d}  g = {r['mu']:+.3f} "
              f"[{r['ci_low']:+.3f}, {r['ci_high']:+.3f}]  I2={r['I2']:.0f}%")
        agent_res[agent] = _num(r)
results["als_by_agent"] = agent_res

# ---- Cumulative meta-analysis by publication year ------------------------
print("\n--- Cumulative meta-analysis by year (decline effect) ---")
alsy = als.sort_values("year").reset_index(drop=True)
cum = []
for i in range(len(alsy)):
    sl = alsy.iloc[: i + 1]
    if len(sl) == 1:
        gi = float(sl.g.iloc[0]); si = float(sl.se_g.iloc[0])
        cum.append(dict(year=int(sl.year.iloc[-1]), k=1, mu=gi,
                        lo=gi - 1.96 * si, hi=gi + 1.96 * si,
                        label=sl.study_id.iloc[-1]))
    else:
        r = random_effects(sl.g.values, sl.var_g.values, method="DL",
                           knapp_hartung=False)
        cum.append(dict(year=int(sl.year.iloc[-1]), k=r["k"], mu=r["mu"],
                        lo=r["ci_low"], hi=r["ci_high"],
                        label=sl.study_id.iloc[-1]))
for c in cum:
    print(f"  +{c['label']:14s} ({c['year']})  k={c['k']:2d}  "
          f"cumulative g = {c['mu']:+.3f} [{c['lo']:+.3f}, {c['hi']:+.3f}]")
results["als_cumulative"] = cum

# ---- Small-study effects -------------------------------------------------
eg = egger(als.g.values, als.var_g.values)
print(f"\n--- Egger regression test: intercept = {eg['intercept']:+.3f} "
      f"(SE {eg['se']:.3f}), t = {eg['t']:+.2f}, df = {eg['df']}, p = {eg['p']:.4f}")
tf = trim_and_fill(als.g.values, als.var_g.values, side="left")
print(f"--- Trim-and-fill: {tf['k0']} studies imputed; "
      f"adjusted g = {tf['adjusted']['mu']:+.3f} "
      f"[{tf['adjusted']['ci_low']:+.3f}, {tf['adjusted']['ci_high']:+.3f}]")
results["als_egger"] = _num(eg)
results["als_trimfill"] = {"k0": int(tf["k0"]),
                           "adj_mu": float(tf["adjusted"]["mu"]),
                           "adj_lo": float(tf["adjusted"]["ci_low"]),
                           "adj_hi": float(tf["adjusted"]["ci_high"])}

# ---- Sensitivity: SD assumption and imputed n ----------------------------
print("\n--- Sensitivity of pooled g to the assumed survival SD and imputed n ---")
sens = []
for sd_mult, lbl in [(6 / 9, "SD=6d"), (1.0, "SD=9d (base)"), (12 / 9, "SD=12d"), (14 / 9, "SD=14d")]:
    for n_imp in [8, 12, 20]:
        gg, vv = [], []
        for _, r in als.iterrows():
            n1 = r.n_treat if r.n_source == "reported_exact" else n_imp
            n2 = r.n_ctrl if r.n_source == "reported_exact" else n_imp
            gi, vi = hedges_g(r.delta_days, r.sd * sd_mult, n1, n2)
            gg.append(gi); vv.append(vi)
        rr = random_effects(np.array(gg), np.array(vv), method="REML")
        sens.append(dict(sd=lbl, n=n_imp, mu=rr["mu"], lo=rr["ci_low"],
                         hi=rr["ci_high"], p=rr["p"]))
        print(f"  {lbl:14s} n_imputed={n_imp:2d}   g = {rr['mu']:+.3f} "
              f"[{rr['ci_low']:+.3f}, {rr['ci_high']:+.3f}]  p={rr['p']:.3f}")
results["als_sensitivity"] = sens

# ---- Leave-one-out -------------------------------------------------------
print("\n--- Leave-one-out influence analysis ---")
loo = []
for i in range(len(als)):
    m = np.ones(len(als), bool); m[i] = False
    r = random_effects(als.g.values[m], als.var_g.values[m], method="REML")
    loo.append(dict(omitted=als.study_id.iloc[i], mu=r["mu"],
                    lo=r["ci_low"], hi=r["ci_high"], p=r["p"]))
    print(f"  omit {als.study_id.iloc[i]:14s}  g = {r['mu']:+.3f} "
          f"[{r['ci_low']:+.3f}, {r['ci_high']:+.3f}]  p={r['p']:.3f}")
results["als_loo"] = loo

# ---- Power of the ALS lifespan studies -----------------------------------
print("\n--- Statistical power of the ALS lifespan experiments ---")
pw_obs = [power_two_sample(abs(overall["mu"]), r.n_treat, r.n_ctrl)
          for _, r in als.iterrows()]
print(f"  Median power to detect the pooled effect (g={overall['mu']:+.3f}): "
      f"{100*np.median(pw_obs):.1f}%")
for tgt in [0.3, 0.5, 0.8]:
    print(f"  Per-group n needed for 80% power to detect g={tgt}: "
          f"{n_for_power(tgt, 0.80)}")
results["als_power"] = {"median_power_pooled": float(np.median(pw_obs)),
                        "n_for_g0.3": int(n_for_power(0.3)),
                        "n_for_g0.5": int(n_for_power(0.5)),
                        "n_for_g0.8": int(n_for_power(0.8))}


# ============================================================================
# B. PARKINSON'S DISEASE STRATUM
# ============================================================================
pd_df = pd.read_csv(f"{DATA}/pd_dopaminergic.csv")
k_pd = len(pd_df)
o_sig = int(pd_df.sig_positive.sum())
n_pg = pd_df.n_per_group_typ.values

print("\n" + "=" * 78)
print("B.  PARKINSON'S DISEASE STRATUM  (k = %d in-vivo reports)" % k_pd)
print("=" * 78)
print(pd_df[["study_id", "agent", "model", "species", "direction",
             "sig_positive", "research_group", "n_per_group_typ"]].to_string(index=False))

grp = pd_df.research_group.value_counts()
print(f"\n  Distinct research groups: {pd_df.research_group.nunique()} for {k_pd} reports")
print(f"  Largest single group contributes {grp.iloc[0]} reports "
      f"({100*grp.iloc[0]/k_pd:.0f}% of the evidence base)")
print(f"  Reports with a statistically significant protective effect: {o_sig}/{k_pd} "
      f"({100*o_sig/k_pd:.0f}%)")
print(f"  Species: {dict(pd_df.species.value_counts())}")
print(f"  Independent replication in a second species: "
      f"{'yes' if pd_df.species.nunique() > 1 else 'no'}")

# ---- What true effect would be required to explain the observed hit rate? --
target_rate = o_sig / k_pd
g_req = g_for_power(min(target_rate, 0.999), int(np.median(n_pg)), int(np.median(n_pg)))
print(f"\n--- Effect size required to explain the observed positivity rate ---")
print(f"  With n={int(np.median(n_pg))}/group, a {100*target_rate:.0f}% success rate "
      f"implies a true standardised effect of g >= {g_req:.2f}")
print(f"  (For reference: g=0.8 is conventionally 'large'; g={g_req:.2f} corresponds to "
      f"a {g_req:.1f} SD separation between lesioned-treated and lesioned-control groups.)")

# ---- Excess significance across plausible true effects --------------------
print("\n--- Test of excess significance (Ioannidis & Trikalinos) ---")
tes_rows = []
for g_true in [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]:
    t = excess_significance(o_sig, n_pg, n_pg, g_true)
    tes_rows.append(dict(g_true=g_true, E=t["E"], O=t["O"],
                         mean_power=t["mean_power"], chi2=t["chi2"], p=t["p"]))
    print(f"  assumed true g = {g_true:.1f}:  mean power = {100*t['mean_power']:5.1f}%  "
          f"expected positives = {t['E']:5.2f}  observed = {t['O']:.0f}  "
          f"chi2 = {t['chi2']:6.2f}  p = {t['p']:.4f}")
results["pd_excess_significance"] = tes_rows
results["pd_summary"] = {"k": k_pd, "observed_sig": o_sig,
                         "n_groups": int(pd_df.research_group.nunique()),
                         "largest_group_n": int(grp.iloc[0]),
                         "g_required": float(g_req),
                         "median_n_per_group": float(np.median(n_pg))}

# ---- Power of PD studies for translationally plausible effects ------------
print("\n--- Power of the PD experiments for plausible disease-modifying effects ---")
for g_true in [0.3, 0.5, 0.8]:
    pw = [power_two_sample(g_true, n, n) for n in n_pg]
    print(f"  true g = {g_true}:  median power = {100*np.median(pw):.1f}%  "
          f"(n = {int(np.median(n_pg))}/group)")


# ============================================================================
# C. CROSS-STRATUM: OUTCOME-DOMAIN DISSOCIATION
# ============================================================================
print("\n" + "=" * 78)
print("C.  OUTCOME-DOMAIN DISSOCIATION")
print("=" * 78)
print("""  Genetic target validation (Guo 2003, EAAT2 x SOD1-G93A):
      grip-strength decline .......... DELAYED   (significant)
      motor neuron loss .............. DELAYED   (significant)
      paralysis onset ................ unchanged
      body-weight decline ............ unchanged
      lifespan ....................... unchanged
  The same dissociation is reproduced pharmacologically: ceftriaxone preserved
  strength and body weight for 4-6 weeks in SOD1-G93A mice while the pooled
  lifespan effect is indistinguishable from zero.""")

with open(f"{OUT}/results.json", "w") as f:
    json.dump(results, f, indent=2, default=float)
als.to_csv(f"{OUT}/als_effect_sizes.csv", index=False)
print(f"\n[saved] {OUT}/results.json and als_effect_sizes.csv")
