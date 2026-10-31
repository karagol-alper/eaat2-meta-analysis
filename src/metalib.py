"""
metalib.py — transparent, dependency-light meta-analysis toolkit.

Implemented from first principles (numpy/scipy only) so every number in the
report can be traced to an equation rather than a black-box package.

References for the estimators used:
  Hedges & Olkin (1985)            — g and its small-sample correction J
  DerSimonian & Laird (1986)       — moment estimator of tau^2
  Paule & Mandel (1982)            — iterative generalised-Q estimator of tau^2
  Viechtbauer (2005)               — REML for the random-effects model
  Knapp & Hartung (2003)           — t-based CI, essential when k is small
  Higgins & Thompson (2002)        — I^2, H^2
  IntHout et al. (2016)            — prediction intervals
  Egger et al. (1997)              — regression test for funnel asymmetry
  Duval & Tweedie (2000)           — trim-and-fill
  Ioannidis & Trikalinos (2007)    — test of excess significance
"""

import numpy as np
from scipy import stats, optimize



# ----------------------------------------------------------------------------
# Effect sizes
# ----------------------------------------------------------------------------

def hedges_g(mean_diff, sd_pooled, n1, n2):
    """Hedges' g with the exact-ish small-sample correction J."""
    df = n1 + n2 - 2
    d = mean_diff / sd_pooled
    J = 1.0 - 3.0 / (4.0 * df - 1.0)
    g = J * d
    var_g = (n1 + n2) / (n1 * n2) + g ** 2 / (2.0 * (n1 + n2))
    return g, var_g


def nmd(mean_treat, mean_ctrl, sd_pooled, n1, n2):
    """Normalised mean difference (% change vs control) with delta-method SE.

    The CAMARADES convention for lifespan-type outcomes.
    """
    pct = 100.0 * (mean_treat - mean_ctrl) / mean_ctrl
    se_diff = sd_pooled * np.sqrt(1.0 / n1 + 1.0 / n2)
    se_pct = 100.0 * se_diff / mean_ctrl
    return pct, se_pct ** 2


# ----------------------------------------------------------------------------
# tau^2 estimators
# ----------------------------------------------------------------------------

def tau2_DL(y, v):
    w = 1.0 / v
    mu = np.sum(w * y) / np.sum(w)
    Q = np.sum(w * (y - mu) ** 2)
    k = len(y)
    C = np.sum(w) - np.sum(w ** 2) / np.sum(w)
    return max(0.0, (Q - (k - 1)) / C), Q


def tau2_PM(y, v):
    """Paule-Mandel: solve generalised Q(tau^2) = k-1."""
    k = len(y)

    def gen_q(t2):
        w = 1.0 / (v + t2)
        mu = np.sum(w * y) / np.sum(w)
        return np.sum(w * (y - mu) ** 2) - (k - 1)

    if gen_q(0.0) <= 0:
        return 0.0
    hi = 1.0
    while gen_q(hi) > 0 and hi < 1e6:
        hi *= 2.0
    return optimize.brentq(gen_q, 0.0, hi, xtol=1e-10)


def tau2_REML(y, v):
    """REML via direct maximisation of the restricted log-likelihood."""
    def neg_ll(t2):
        t2 = max(t2, 0.0)
        w = 1.0 / (v + t2)
        mu = np.sum(w * y) / np.sum(w)
        ll = (-0.5 * np.sum(np.log(v + t2))
              - 0.5 * np.log(np.sum(w))
              - 0.5 * np.sum(w * (y - mu) ** 2))
        return -ll

    res = optimize.minimize_scalar(neg_ll, bounds=(0.0, max(10.0, 10 * np.var(y))),
                                   method="bounded")
    return max(0.0, float(res.x))


# ----------------------------------------------------------------------------
# Random-effects model
# ----------------------------------------------------------------------------

def random_effects(y, v, method="REML", knapp_hartung=True, level=0.95):
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    k = len(y)

    t2_dl, Q = tau2_DL(y, v)
    if method == "DL":
        t2 = t2_dl
    elif method == "PM":
        t2 = tau2_PM(y, v)
    else:
        t2 = tau2_REML(y, v)

    w = 1.0 / (v + t2)
    mu = np.sum(w * y) / np.sum(w)
    se_fixedlike = np.sqrt(1.0 / np.sum(w))

    if knapp_hartung and k > 1:
        # Knapp-Hartung variance inflation + t reference distribution
        q_kh = np.sum(w * (y - mu) ** 2) / (k - 1)
        se = se_fixedlike * np.sqrt(max(q_kh, 1e-12))
        dfree = k - 1
        crit = stats.t.ppf(0.5 + level / 2.0, dfree)
        tstat = mu / se
        p = 2 * stats.t.sf(abs(tstat), dfree)
    else:
        se = se_fixedlike
        dfree = np.inf
        crit = stats.norm.ppf(0.5 + level / 2.0)
        tstat = mu / se
        p = 2 * stats.norm.sf(abs(tstat))

    ci = (mu - crit * se, mu + crit * se)

    # heterogeneity
    df_q = k - 1
    p_Q = stats.chi2.sf(Q, df_q) if df_q > 0 else np.nan
    I2 = max(0.0, 100.0 * (Q - df_q) / Q) if Q > 0 else 0.0
    H2 = Q / df_q if df_q > 0 else np.nan

    # 95% prediction interval (IntHout 2016)
    if k > 2:
        pi_crit = stats.t.ppf(0.975, k - 2)
        pi_se = np.sqrt(se ** 2 + t2)
        pred = (mu - pi_crit * pi_se, mu + pi_crit * pi_se)
    else:
        pred = (np.nan, np.nan)

    return dict(k=k, mu=mu, se=se, ci_low=ci[0], ci_high=ci[1], p=p,
                tau2=t2, tau=np.sqrt(t2), Q=Q, df=df_q, p_Q=p_Q, I2=I2, H2=H2,
                pred_low=pred[0], pred_high=pred[1], method=method,
                knapp_hartung=knapp_hartung, weights=w / w.sum())


def subgroup_test(results_by_group):
    """Cochran's Q between subgroups (fixed-effect across subgroup means)."""
    mus = np.array([r["mu"] for r in results_by_group])
    ses = np.array([r["se"] for r in results_by_group])
    w = 1.0 / ses ** 2
    mu_all = np.sum(w * mus) / np.sum(w)
    Qb = np.sum(w * (mus - mu_all) ** 2)
    df = len(mus) - 1
    return Qb, df, stats.chi2.sf(Qb, df)


# ----------------------------------------------------------------------------
# Small-study effects
# ----------------------------------------------------------------------------

def egger(y, v):
    """Egger regression: y/se ~ 1/se. Intercept != 0 => funnel asymmetry."""
    se = np.sqrt(np.asarray(v, float))
    snd = np.asarray(y, float) / se
    prec = 1.0 / se
    X = np.column_stack([np.ones_like(prec), prec])
    beta, *_ = np.linalg.lstsq(X, snd, rcond=None)
    resid = snd - X @ beta
    n, p = X.shape
    if n - p <= 0:
        return dict(intercept=beta[0], se=np.nan, t=np.nan, p=np.nan, df=0)
    s2 = resid @ resid / (n - p)
    cov = s2 * np.linalg.inv(X.T @ X)
    se_b0 = np.sqrt(cov[0, 0])
    t = beta[0] / se_b0
    return dict(intercept=beta[0], se=se_b0, t=t,
                p=2 * stats.t.sf(abs(t), n - p), df=n - p)


def trim_and_fill(y, v, side="left", method="R0", max_iter=50):
    """Duval & Tweedie trim-and-fill. Returns imputed studies and adjusted model."""
    y = np.asarray(y, float)
    v = np.asarray(v, float)
    flip = 1.0 if side == "left" else -1.0
    yy, vv = flip * y, v.copy()

    k0 = 0
    for _ in range(max_iter):
        keep = np.argsort(yy)[k0:] if k0 > 0 else np.arange(len(yy))
        sub_y, sub_v = yy[keep], vv[keep]
        r = random_effects(sub_y, sub_v, method="DL", knapp_hartung=False)
        centred = yy - r["mu"]
        order = np.argsort(np.abs(centred))
        ranks = np.empty(len(yy))
        ranks[order] = np.arange(1, len(yy) + 1)
        signed = np.sign(centred) * ranks
        pos = signed[signed > 0]
        n = len(yy)
        if method == "R0":
            gamma = np.max(signed) if len(signed) else 0
            new_k0 = int(max(0, np.ceil((-1 + np.sqrt(1 + 8 * abs(pos.sum() if len(pos) else 0))) / 2) - 1)) if False else \
                     int(max(0, (n - np.max(ranks[signed < 0]) if np.any(signed < 0) else 0)))
        else:
            new_k0 = 0
        Tn = pos.sum() if len(pos) else 0.0
        new_k0 = int(max(0, round((4 * Tn - n * (n + 1)) / (2 * n - 1)))) if n > 0 else 0
        if new_k0 == k0:
            break
        k0 = new_k0

    if k0 <= 0:
        base = random_effects(y, v, method="DL", knapp_hartung=False)
        return dict(k0=0, imputed_y=np.array([]), imputed_v=np.array([]),
                    adjusted=base)

    r = random_effects(yy, vv, method="DL", knapp_hartung=False)
    top = np.argsort(yy)[-k0:]
    imp_y = 2 * r["mu"] - yy[top]
    imp_v = vv[top]
    full_y = flip * np.concatenate([yy, imp_y])
    full_v = np.concatenate([vv, imp_v])
    adj = random_effects(full_y, full_v, method="DL", knapp_hartung=False)
    return dict(k0=k0, imputed_y=flip * imp_y, imputed_v=imp_v, adjusted=adj)


# ----------------------------------------------------------------------------
# Power and excess significance
# ----------------------------------------------------------------------------

def power_two_sample(g, n1, n2, alpha=0.05):
    """Power of a two-sided two-sample t-test for true standardised effect g."""
    df = n1 + n2 - 2
    if df <= 0:
        return np.nan
    ncp = g * np.sqrt(n1 * n2 / (n1 + n2))
    crit = stats.t.ppf(1 - alpha / 2, df)
    return (stats.nct.sf(crit, df, ncp) + stats.nct.cdf(-crit, df, ncp))


def g_for_power(target_power, n1, n2, alpha=0.05):
    """Invert power_two_sample: standardised effect needed for a target power."""
    f = lambda g: power_two_sample(g, n1, n2, alpha) - target_power
    if f(0.01) > 0:
        return 0.01
    hi = 0.5
    while f(hi) < 0 and hi < 50:
        hi *= 1.6
    return optimize.brentq(f, 0.01, hi, xtol=1e-6)


def n_for_power(g, target_power=0.80, alpha=0.05):
    """Per-group n needed to detect g at target power."""
    for n in range(3, 5000):
        if power_two_sample(g, n, n, alpha) >= target_power:
            return n
    return np.nan


def excess_significance(observed_sig, n1s, n2s, g_true, alpha=0.05):
    """Ioannidis & Trikalinos test of excess significance.

    Compares the observed number of 'positive' studies with the number expected
    given the assumed true effect and the actual sample sizes.
    """
    powers = np.array([power_two_sample(g_true, a, b, alpha)
                       for a, b in zip(n1s, n2s)])
    E = powers.sum()
    O = float(observed_sig)
    k = len(powers)
    if E <= 0 or E >= k:
        return dict(O=O, E=E, k=k, chi2=np.nan, p=np.nan, powers=powers)
    chi2 = (O - E) ** 2 / E + (O - E) ** 2 / (k - E)
    return dict(O=O, E=E, k=k, chi2=chi2, p=stats.chi2.sf(chi2, 1),
                powers=powers, mean_power=powers.mean())
