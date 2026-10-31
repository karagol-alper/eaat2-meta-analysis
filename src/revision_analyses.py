"""
revision_analyses.py — analyses added in response to peer review.

R1  Monte-Carlo sensitivity to the delta = 0 coding of null results.
R2  Confounding of laboratory independence with publication year.
R3  Mouse-to-human predictive validity of the SOD1-G93A lifespan endpoint.
R4  Whether the null replications could exclude a clinically meaningful effect.
R5  Agent-level evidence density.
R6  PD efficacy stratum: excess significance and research-group clustering.
R7  What a two-agent concordance observation can support.
"""

import json, sys
import numpy as np
import pandas as pd
from scipy import stats


from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]   # repository root
(ROOT / "out").mkdir(exist_ok=True)
(ROOT / "figs").mkdir(exist_ok=True)

sys.path.insert(0, f"{ROOT}/src")
from metalib import (hedges_g, nmd, random_effects, subgroup_test,
                     power_two_sample, g_for_power, excess_significance)

DATA, OUT = f"{ROOT}/data", f"{ROOT}/out"
SD_SURVIVAL = {"SOD1-G93A": 9.0, "SOD1-G93A x EAAT2 tg": 9.0, "TDP-43-A315T": 12.0,
               "FUS(1-359)": 10.0, "TDP-43 tg rat": 12.0}
N_IMP = 12
rng = np.random.default_rng(20260907)
res = {}

als = pd.read_csv(f"{DATA}/als_lifespan.csv")
als["sd"] = als["model"].map(SD_SURVIVAL).fillna(9.0)
als["n_treat"] = als["n_treat"].fillna(N_IMP)
als["n_ctrl"] = als["n_ctrl"].fillna(N_IMP)
als["se_days"] = als.sd * np.sqrt(1 / als.n_treat + 1 / als.n_ctrl)
is_null = (als.delta_source == "explicit_null").values


# ===========================================================================
# R1. The delta = 0 convention manufactures zero within-subgroup scatter.
#     Redraw each null study's point estimate from the sampling distribution
#     it is actually consistent with: N(0, SE^2) truncated to |delta| < 1.96 SE,
#     which is what "reported as non-significant" tells us.
# ===========================================================================
print("=" * 78)
print("R1.  SENSITIVITY TO THE delta = 0 CODING OF NULL RESULTS")
print("=" * 78)

NSIM = 10000
mus, ps, taus, i2s, qb_ps, sub_o, sub_i = [], [], [], [], [], [], []
lo_t, hi_t = stats.truncnorm.ppf([0.0001, 0.9999], -1.96, 1.96)

for _ in range(NSIM):
    delta = als.delta_days.values.astype(float).copy()
    draw = stats.truncnorm.rvs(-1.96, 1.96, loc=0.0,
                               scale=als.se_days.values[is_null],
                               random_state=rng)
    delta[is_null] = draw
    g = np.empty(len(als)); v = np.empty(len(als))
    for i, (d, sd, n1, n2) in enumerate(zip(delta, als.sd, als.n_treat, als.n_ctrl)):
        g[i], v[i] = hedges_g(d, sd, n1, n2)
    r = random_effects(g, v, method="REML")
    mus.append(r["mu"]); ps.append(r["p"]); taus.append(r["tau2"]); i2s.append(r["I2"])
    m = als.lab_independent_of_originator.values == 0
    ro = random_effects(g[m], v[m], method="DL", knapp_hartung=False)
    ri = random_effects(g[~m], v[~m], method="DL", knapp_hartung=False)
    sub_o.append(ro["mu"]); sub_i.append(ri["mu"])
    qb_ps.append(subgroup_test([ro, ri])[2])

mus, ps, i2s, qb_ps = map(np.array, (mus, ps, i2s, qb_ps))
sub_o, sub_i = np.array(sub_o), np.array(sub_i)
print(f"  Pooled g   : median {np.median(mus):+.3f}  "
      f"2.5-97.5 pct {np.percentile(mus,2.5):+.3f} to {np.percentile(mus,97.5):+.3f}")
print(f"  Proportion of simulations with a significant pooled effect: {(ps<0.05).mean():.1%}")
print(f"  I^2        : median {np.median(i2s):.1f}%  (deterministic coding gave 22.1%)")
print(f"  Originating subgroup g : median {np.median(sub_o):+.3f}")
print(f"  Independent subgroup g : median {np.median(sub_i):+.3f}  "
      f"2.5-97.5 pct {np.percentile(sub_i,2.5):+.3f} to {np.percentile(sub_i,97.5):+.3f}")
print(f"  Between-subgroup test  : median p = {np.median(qb_ps):.4f}; "
      f"p < 0.05 in {(qb_ps<0.05).mean():.1%} of simulations")
res["R1"] = dict(pooled_median=float(np.median(mus)),
                 pooled_lo=float(np.percentile(mus, 2.5)),
                 pooled_hi=float(np.percentile(mus, 97.5)),
                 prop_sig=float((ps < 0.05).mean()),
                 I2_median=float(np.median(i2s)),
                 sub_orig_median=float(np.median(sub_o)),
                 sub_indep_median=float(np.median(sub_i)),
                 sub_indep_lo=float(np.percentile(sub_i, 2.5)),
                 sub_indep_hi=float(np.percentile(sub_i, 97.5)),
                 qb_p_median=float(np.median(qb_ps)),
                 qb_prop_sig=float((qb_ps < 0.05).mean()))


# ===========================================================================
# R2. Laboratory independence is confounded with publication year.
# ===========================================================================
print("\n" + "=" * 78)
print("R2.  CONFOUNDING OF LABORATORY INDEPENDENCE WITH YEAR")
print("=" * 78)

g0, v0 = [], []
for _, r in als.iterrows():
    a, b = hedges_g(r.delta_days, r.sd, r.n_treat, r.n_ctrl)
    g0.append(a); v0.append(b)
als["g"], als["var_g"] = g0, v0

indep = als.lab_independent_of_originator.values.astype(float)
year = als.year.values.astype(float)
rb, pb = stats.pointbiserialr(indep, year)
print(f"  Correlation between year and laboratory independence: r = {rb:+.3f}, p = {pb:.4f}")
print(f"  Originating studies: years {sorted(als.year[indep==0])}")
print(f"  Independent studies: years {sorted(als.year[indep==1])}")


def re_metareg(y, v, X, tau2=None):
    """Random-effects meta-regression by weighted least squares."""
    y = np.asarray(y, float); v = np.asarray(v, float)
    X = np.column_stack([np.ones(len(y))] + [np.asarray(c, float) for c in X])
    if tau2 is None:
        tau2 = random_effects(y, v, method="REML")["tau2"]
    W = np.diag(1.0 / (v + tau2))
    XtWX = X.T @ W @ X
    beta = np.linalg.solve(XtWX, X.T @ W @ y)
    cov = np.linalg.inv(XtWX)
    se = np.sqrt(np.diag(cov))
    z = beta / se
    return beta, se, z, 2 * stats.norm.sf(np.abs(z))


for name, cols in [("year only", [year - year.mean()]),
                   ("independence only", [indep]),
                   ("year + independence", [year - year.mean(), indep])]:
    b, se, z, p = re_metareg(als.g.values, als.var_g.values, cols)
    lbl = ["intercept"] + (["year", "independent"] if len(cols) == 2
                           else ["year" if "year" in name else "independent"])
    print(f"\n  Model: {name}")
    for nm, bb, ss, pp in zip(lbl, b, se, p):
        print(f"    {nm:12s} beta = {bb:+.4f} (SE {ss:.4f})  p = {pp:.4f}")
res["R2"] = dict(r_year_indep=float(rb), p_year_indep=float(pb))


# ===========================================================================
# R3. Predictive validity: what did the mouse endpoint say, and what happened
#     in patients? Expressed as percentage change in survival for comparability.
# ===========================================================================
print("\n" + "=" * 78)
print("R3.  MOUSE-TO-HUMAN CONCORDANCE FOR THE TWO AGENTS TESTED IN BOTH")
print("=" * 78)

pct, vpct = [], []
for _, r in als.iterrows():
    a, b = nmd(r.ctrl_mean_days + r.delta_days, r.ctrl_mean_days, r.sd, r.n_treat, r.n_ctrl)
    pct.append(a); vpct.append(b)
als["pct"], als["var_pct"] = pct, vpct

ril_indep = als[(als.agent == "Riluzole") & (als.lab_independent_of_originator == 1)]
ril_orig = als[(als.agent == "Riluzole") & (als.lab_independent_of_originator == 0)]
cef = als[als.agent == "Ceftriaxone"]

r_ri = random_effects(ril_indep.pct.values, ril_indep.var_pct.values,
                      method="REML")
print(f"  Riluzole, independent mouse replications : "
      f"{r_ri['mu']:+.2f}% (95% CI {r_ri['ci_low']:+.2f} to {r_ri['ci_high']:+.2f})")
print(f"  Riluzole, originating mouse study        : {float(ril_orig.pct.iloc[0]):+.2f}%")
print(f"  Ceftriaxone, originating mouse study     : {float(cef.pct.iloc[0]):+.2f}%")
print("\n  Human outcomes (external anchors):")
print("  Riluzole    : median tracheostomy-free survival 11.8 -> 14.8 months = +25.4%;")
print("                2-3 months on ~30-36 months total survival = +6 to +10%;")
print("                9% absolute gain in 1-year survival. POSITIVE.")
print("  Ceftriaxone : phase 3, 514 participants, no survival benefit. NULL.")
print("\n  => The independent mouse replications returned a NULL for the one agent in")
print("     this class with a demonstrated human survival benefit (false negative),")
print("     while the originating mouse study returned a POSITIVE for the agent that")
print("     subsequently failed in phase 3 (false positive).")
res["R3"] = dict(riluzole_indep_pct=float(r_ri["mu"]),
                 riluzole_indep_lo=float(r_ri["ci_low"]),
                 riluzole_indep_hi=float(r_ri["ci_high"]),
                 riluzole_orig_pct=float(ril_orig.pct.iloc[0]),
                 ceftriaxone_orig_pct=float(cef.pct.iloc[0]))


# ===========================================================================
# R4. Could the null replications have excluded a human-equivalent effect?
# ===========================================================================
print("\n" + "=" * 78)
print("R4.  COULD THE NULL STUDIES EXCLUDE A CLINICALLY MEANINGFUL EFFECT?")
print("=" * 78)

print(f"  95% CI for independent riluzole replications: "
      f"{r_ri['ci_low']:+.2f}% to {r_ri['ci_high']:+.2f}%")
for target, lbl in [(6.0, "lower bound of human riluzole benefit (+6%)"),
                    (10.0, "upper bound of human riluzole benefit (+10%)"),
                    (25.4, "human median TFS gain (+25.4%)")]:
    excluded = target > r_ri["ci_high"]
    print(f"    {lbl:48s} {'EXCLUDED' if excluded else 'NOT excluded'} by the CI")

n_med = int(np.median(np.r_[ril_indep.n_treat.values, ril_indep.n_ctrl.values]))
for pct_t in [6.0, 10.0, 25.4]:
    g_t = (pct_t / 100.0 * 128.0) / 9.0
    pw = power_two_sample(g_t, n_med, n_med)
    print(f"    Power at n={n_med}/group to detect a {pct_t:.1f}% survival gain "
          f"(g={g_t:.2f}): {100*pw:.1f}%")
res["R4"] = dict(n_median=n_med,
                 excl_6=bool(6.0 > r_ri["ci_high"]),
                 excl_10=bool(10.0 > r_ri["ci_high"]),
                 excl_25=bool(25.4 > r_ri["ci_high"]))


# ===========================================================================
# R5. Agent-specific evidence density
# ===========================================================================
print("\n" + "=" * 78)
print("R5.  HOW MUCH OF THE EVIDENCE IS ACTUALLY ABOUT EACH AGENT?")
print("=" * 78)
for agent in als.agent.unique():
    k = (als.agent == agent).sum()
    print(f"  {agent:22s} k = {k:2d}  ({100*k/len(als):4.1f}% of lifespan comparisons)")
print(f"\n  Ceftriaxone lifespan evidence rests on k = 1 comparison, from the")
print(f"  originating laboratory, with no independent rodent replication identified.")


# ===========================================================================
# R6. PD efficacy stratum, excluding the reclassified dysbiosis experiment,
#     with sensitivity to research-group clustering.
# ===========================================================================
pdd = pd.read_csv(f"{DATA}/pd_dopaminergic.csv")
eff = pdd[pdd.stratum == "efficacy"]
n_pg = eff.n_per_group_typ.values.astype(int)
k_pd, o_pd = len(eff), int(eff.sig_positive.sum())

print("\n" + "=" * 78)
print(f"R6.  PD EFFICACY STRATUM (k = {k_pd}, observed positives = {o_pd})")
print("=" * 78)
g_req = g_for_power(0.999, int(np.median(n_pg)), int(np.median(n_pg)))
print(f"  Effect required for a {o_pd}/{k_pd} success rate at "
      f"n = {int(np.median(n_pg))}/group: g >= {g_req:.2f}")

tes = []
for g_true in [0.3, 0.5, 0.8, 1.0, 1.5, 2.0]:
    t = excess_significance(o_pd, n_pg, n_pg, g_true)
    tes.append(dict(g_true=g_true, mean_power=float(t["mean_power"]),
                    E=float(t["E"]), O=float(t["O"]),
                    chi2=float(t["chi2"]), p=float(t["p"])))
    print(f"   g = {g_true:.1f}:  power {100*t['mean_power']:5.1f}%  "
          f"E = {t['E']:5.2f}  O = {t['O']:.0f}  "
          f"chi2 = {t['chi2']:7.2f}  p = {t['p']:.4g}")

print("\n  Sensitivity to research-group clustering:")
dominant = eff.research_group.value_counts().idxmax()
sub = eff[eff.research_group != dominant]
ns = sub.n_per_group_typ.values.astype(int)
t_ex = excess_significance(int(sub.sig_positive.sum()), ns, ns, 1.0)
print(f"   excluding the dominant group ({dominant}, "
      f"{(eff.research_group == dominant).sum()} reports): k = {len(sub)}, "
      f"chi2 = {t_ex['chi2']:.2f}, p = {t_ex['p']:.4g}  (assumed g = 1.0)")
n_grp = np.full(eff.research_group.nunique(), int(np.median(n_pg)))
t_gr = excess_significance(len(n_grp), n_grp, n_grp, 1.0)
print(f"   one observation per group: k = {len(n_grp)}, "
      f"chi2 = {t_gr['chi2']:.2f}, p = {t_gr['p']:.4g}  (assumed g = 1.0)")

res["R6"] = dict(k=k_pd, O=o_pd, g_required=float(g_req), tes=tes,
                 n_groups=int(eff.research_group.nunique()),
                 dominant_group=str(dominant),
                 k_ex_dominant=int(len(sub)),
                 chi2_ex_dominant=float(t_ex["chi2"]), p_ex_dominant=float(t_ex["p"]),
                 chi2_per_group=float(t_gr["chi2"]), p_per_group=float(t_gr["p"]))


# ===========================================================================
# R7. What can a two-agent concordance observation support?
# ===========================================================================
print("\n" + "=" * 78)
print("R7.  BOUND ON A TWO-AGENT CONCORDANCE OBSERVATION")
print("=" * 78)

def clopper_pearson(k, n, alpha=0.05):
    lo = 0.0 if k == 0 else stats.beta.ppf(alpha / 2, k, n - k + 1)
    hi = 1.0 if k == n else stats.beta.ppf(1 - alpha / 2, k + 1, n - k)
    return float(lo), float(hi)

lo, hi = clopper_pearson(0, 2)
print(f"  Concordance 0 of 2 agents -> exact 95% CI for the rate: "
      f"{100*lo:.0f}% to {100*hi:.0f}%")
print("  The discordance RATE is therefore not estimable from two agents.")

upper = r_ri["ci_high"]          # upper 95% bound, independent riluzole replications
se_r  = r_ri["se"]
print(f"\n  The riluzole exclusion stands alone (pooled {r_ri['mu']:+.2f}%, "
      f"SE {se_r:.3f}%).")
print("  Robustness to the choice of human effect scaling:")
scalings = [(0.7, 36.0, "0.7 mo / 36 mo (deliberately sceptical)"),
            (2.0, 36.0, "2 mo / 36 mo (most conservative)"),
            (2.0, 30.0, "2 mo / 30 mo"),
            (3.0, 30.0, "3 mo / 30 mo (Cochrane upper)")]
rows = []
for months, total, lbl in scalings:
    pct = 100 * months / total
    z = (pct - r_ri["mu"]) / se_r
    excluded = pct > upper
    rows.append(dict(label=lbl, pct=pct, se_distance=float(z), excluded=bool(excluded)))
    print(f"    {lbl:42s} = {pct:5.2f}%  {z:5.1f} SE  "
          f"{'EXCLUDED' if excluded else 'not excluded'}")
pct_tfs = 25.4
print(f"    {'median TFS 11.8 -> 14.8 months':42s} = {pct_tfs:5.2f}%  "
      f"{(pct_tfs - r_ri['mu'])/se_r:5.1f} SE  EXCLUDED")
print(f"\n  Threshold: the murine interval is incompatible with any human benefit")
print(f"  exceeding {upper:.2f}% of total survival, about "
      f"{upper/100*36*4.3:.0f} weeks on a 36-month course.")

print("\n  Power of individual replications (n = 12/group) across the range:")
for pct in [5.56, 10.0]:
    g_t = (pct / 100 * 128.0) / 9.0
    print(f"    {pct:5.2f}% of lifespan (g = {g_t:4.2f}): "
          f"power = {100*power_two_sample(g_t, 12, 12):5.1f}%")
print("  Pooling achieves a precision no single experiment had.")

res["R7"] = dict(concordance_ci=[lo, hi], mouse_upper_pct=float(upper),
                 pooled_se=float(se_r), scalings=rows)

with open(f"{OUT}/revision_results.json", "w") as f:
    json.dump(res, f, indent=2)
print(f"\n[saved] {OUT}/revision_results.json")
