/* build_manuscript.js — submission-ready .docx of the EAAT2 meta-analysis */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  PageBreak, Footer, PageNumber, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, ImageRun, LineNumberRestartFormat, convertInchesToTwip,
} = require("docx");

const FIGS = path.join(ROOT, "figs");
const CONTENT_W = 9360;            // 12240 - 2*1440 (US Letter, 1in margins)
const FONT = "Times New Roman";

/* ---------------------------------------------------------------- inline markup */
// supports **bold**, *italic*, and ^superscript^
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|\^[^^]+\^)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ ...base, text: text.slice(last, m.index) }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ ...base, text: tok.slice(2, -2), bold: true }));
    else if (tok.startsWith("^")) out.push(new TextRun({ ...base, text: tok.slice(1, -1), superScript: true }));
    else out.push(new TextRun({ ...base, text: tok.slice(1, -1), italics: true }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ ...base, text: text.slice(last) }));
  return out;
}

/* ---------------------------------------------------------------- builders */
const P = (text, opts = {}) => new Paragraph({
  children: runs(text, { font: FONT, size: opts.size || 24 }),
  spacing: { line: opts.line || 480, after: opts.after === undefined ? 0 : opts.after },
  alignment: opts.align,
  indent: opts.indent,
});

const H1 = (t) => new Paragraph({
  children: runs(t, { font: FONT, size: 26, bold: true }),
  heading: HeadingLevel.HEADING_1,
  spacing: { before: 360, after: 160, line: 480 },
});

const H2 = (t) => new Paragraph({
  children: runs(t, { font: FONT, size: 24, bold: true }),
  heading: HeadingLevel.HEADING_2,
  spacing: { before: 280, after: 120, line: 480 },
});

const H3 = (t) => new Paragraph({
  children: runs(t, { font: FONT, size: 24, bold: false, italics: true }),
  heading: HeadingLevel.HEADING_3,
  spacing: { before: 240, after: 100, line: 480 },
});

const BLANK = (n = 1) => Array.from({ length: n }, () => P(""));
const BREAK = () => new Paragraph({ children: [new PageBreak()] });

const EQ = (t) => new Paragraph({
  children: runs(t, { font: FONT, size: 24, italics: true }),
  alignment: AlignmentType.CENTER,
  spacing: { before: 160, after: 160, line: 360 },
});

function cell(text, { bold = false, w, shade, align, size = 20 } = {}) {
  return new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: shade ? { type: ShadingType.CLEAR, fill: shade, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: [new Paragraph({
      children: runs(text, { font: FONT, size, bold }),
      spacing: { line: 240, before: 0, after: 0 },
      alignment: align,
    })],
  });
}

function mkTable(headers, rows, widths, opts = {}) {
  const size = opts.size || 20;
  const aligns = opts.aligns || headers.map(() => undefined);
  const head = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) =>
      cell(h, { bold: true, w: widths[i], shade: "EDEDED", align: aligns[i], size })),
  });
  const body = rows.map((r) => new TableRow({
    children: r.map((c, i) => cell(String(c), { w: widths[i], align: aligns[i], size })),
  }));
  return new Table({
    columnWidths: widths,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
      left:   { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "BFBFBF" },
      insideVertical:   { style: BorderStyle.NONE },
    },
    rows: [head, ...body],
  });
}

const TCAP = (n, t) => new Paragraph({
  children: [...runs(`Table ${n}. `, { font: FONT, size: 22, bold: true }),
             ...runs(t, { font: FONT, size: 22 })],
  spacing: { before: 240, after: 120, line: 300 },
});

const TNOTE = (t) => new Paragraph({
  children: runs(t, { font: FONT, size: 20, italics: true }),
  spacing: { before: 100, after: 240, line: 300 },
});

function figure(file, ratio, widthPx = 600) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 200, after: 200 },
    children: [new ImageRun({
      type: "png",
      data: fs.readFileSync(`${FIGS}/${file}`),
      transformation: { width: widthPx, height: Math.round(widthPx * ratio) },
    })],
  });
}

const FCAP = (n, bold, rest) => new Paragraph({
  children: [...runs(`Figure ${n}. ${bold}`, { font: FONT, size: 22, bold: true }),
             ...runs(" " + rest, { font: FONT, size: 22 })],
  spacing: { before: 120, after: 320, line: 300 },
});

const REF = (n, t) => new Paragraph({
  children: runs(`${n}. ${t}`, { font: FONT, size: 22 }),
  spacing: { line: 300, after: 120 },
  indent: { left: 360, hanging: 360 },
});

/* ================================================================ DOCUMENT */
const doc = [];
const supp = [];

/* ---- Title page ---- */
doc.push(
  new Paragraph({
    children: runs("EAAT2 up-regulation preserves neurons without extending lifespan, and the murine survival endpoint is discordant with clinical outcome: a systematic review and meta-analysis in ALS and Parkinson's disease",
      { font: FONT, size: 28, bold: true }),
    alignment: AlignmentType.CENTER,
    spacing: { line: 360, after: 400 },
  }),
  P("Alper Karag\u00f6l^2,\u2020,*^, Taner Karag\u00f6l^2,\u00b6,*^", { align: AlignmentType.CENTER, after: 220, size: 24 }),
  P("^2^Istanbul University Istanbul Medical Faculty, Istanbul, Turkey", { align: AlignmentType.CENTER, line: 300, after: 100, size: 22 }),
  P("^\u2020^Present address: Broad Institute of MIT and Harvard, Cambridge, MA, USA; Department of Mechanical Engineering, Massachusetts Institute of Technology, Cambridge, MA, USA", { align: AlignmentType.CENTER, line: 300, after: 100, size: 22 }),
  P("^\u00b6^Present address: McGovern Institute for Brain Research, Massachusetts Institute of Technology, Cambridge, MA, USA", { align: AlignmentType.CENTER, line: 300, after: 100, size: 22 }),
  P("^*^To whom correspondence should be addressed", { align: AlignmentType.CENTER, line: 300, after: 340, size: 22 }),
  P("**Corresponding authors**", { line: 360, after: 80 }),
  P("Alper Karag\u00f6l, akaragol@mit.edu, ORCID 0009-0001-7864-0732", { line: 320, after: 60 }),
  P("Taner Karag\u00f6l, karagolt@mit.edu, ORCID 0009-0005-1011-7661", { line: 320, after: 60 }),
  P("[Postal address and telephone to be supplied]", { line: 320, after: 220 }),
  P("**Running title:** EAAT2 up-regulation, neuronal survival and lifespan", { line: 360, after: 200 }),
  P("**Article type:** Systematic review and meta-analysis (preclinical)", { line: 360, after: 200 }),
  P("**Word count:** abstract 486; main text approximately 7,100", { line: 360, after: 200 }),
  P("**Display items:** 5 tables and 3 figures; 5 supplementary tables and 1 supplementary figure", { line: 360, after: 200 }),
  P("**References:** 42", { line: 360, after: 200 }),
  P("**Keywords:** EAAT2; GLT-1; ceftriaxone; riluzole; amyotrophic lateral sclerosis; Parkinson's disease; preclinical meta-analysis; translational failure; excitotoxicity", { line: 360, after: 200 }),
  P("**Data availability:** dataset, analysis code, computed effect sizes and full console output are provided as supplementary material; all estimates regenerate with a single command.", { line: 360, after: 200 }),
  P("**Funding:** none. **Competing interests:** declared in full in the Declarations section. **Registration:** not prospectively registered. **Prior presentation:** late-breaking abstract, Society for Neuroscience annual meeting, 2026.", { line: 360 }),
  BREAK(),
);

/* ---- Abstract ---- */
doc.push(H1("Abstract"));
[
  ["Background.", "Up-regulation of the astrocytic glutamate transporter EAAT2 (rodent GLT-1) has been pursued as a disease-modifying strategy for neurodegeneration for two decades, on the basis of preclinical reports that β-lactam antibiotics and riluzole preserve neurons and extend survival. The behavioural effects of β-lactams have been meta-analysed for substance use disorders, but no quantitative synthesis exists for lifespan or neuronal survival in models of amyotrophic lateral sclerosis (ALS) or Parkinson's disease (PD). A phase 3 trial of ceftriaxone in ALS was nonetheless conducted and was negative."],
  ["Objective.", "To estimate the pooled therapeutic effect of EAAT2 up-regulators on lifespan in ALS models and on dopaminergic neuron survival in PD models, and to test the predictive validity of the SOD1-G93A lifespan endpoint against the two agents in this class whose outcome in patients is known."],
  ["Methods.", "Systematic identification of in vivo rodent studies of interventions acting through increased EAAT2/GLT-1 expression or function (β-lactams, riluzole, genetic and viral EAAT2 overexpression) in ALS or PD models with a concurrent control. Two strata were analysed: lifespan in ALS models (k = 12 comparisons, of which 9 riluzole and only 1 ceftriaxone) and dopaminergic neuroprotection in PD models (k = 14 efficacy reports, with one further report reclassified as a safety observation). Random-effects models (restricted maximum likelihood, Knapp–Hartung adjustment) were fitted to Hedges' *g* and to the normalised mean difference. Analyses included subgrouping by laboratory independence, cumulative meta-analysis, Egger's regression, trim-and-fill, leave-one-out, statistical power, the Ioannidis–Trikalinos test of excess significance, a Monte-Carlo sensitivity analysis in which null results were redrawn from their sampling distribution rather than fixed at zero, joint meta-regression on year and laboratory independence, and a comparison of mouse and human outcomes for riluzole and ceftriaxone. Every extracted value carries an explicit provenance tier."],
  ["Results.", "The pooled effect on lifespan was *g* = +0.20 (95% CI −0.08 to +0.48; p = 0.14), equivalent to a change in survival of +1.82% (95% CI −0.41% to +4.05%; p = 0.099), and was non-significant under all twelve combinations of assumed survival dispersion and imputed group size. Effects segregated by laboratory of origin: originating laboratories *g* = +1.20 (95% CI +0.59 to +1.82), independent replications *g* = +0.05 (95% CI −0.18 to +0.28); between-subgroup Q = 11.77, df = 1, p = 0.0006, with I² = 0% within each subgroup. The cumulative estimate declined by 84% between 1996 and 2020. Median power to detect the pooled effect was 7.6%; 64 animals per group would be required to detect *g* = 0.5 at 80% power. The subgroup contrast survived a Monte-Carlo sensitivity analysis (p < 0.05 in 100% of 10,000 simulations), although laboratory independence was collinear with publication year (r = +0.64, p = 0.024). Transgenic and viral EAAT2 overexpression delayed grip-strength decline and motor neuron loss with no effect on lifespan. Critically, the independent replications estimated riluzole's effect on mouse lifespan at +0.5% (95% CI −0.8% to +1.8%; pooled SE 0.56%). Riluzole's established benefit in patients corresponds to roughly 6% to 10% of total survival, which lies 9 to 17 pooled standard errors above the mouse estimate and remains excluded even under a deliberately sceptical human benefit of three weeks. The murine endpoint therefore returned a demonstrable false negative for the one agent in this class with proven clinical benefit, while the single ceftriaxone comparison returned a positive for the agent that subsequently failed in phase 3; with only two agents, however, the rate of such discordance is not estimable (exact 95% CI 0% to 84%). In the PD stratum, all 14 efficacy reports were positive, a rate requiring a true effect of *g* ≥ 2.73; excess significance was rejected for every assumed true effect up to *g* = 1.0 and survived exclusion of the dominant research group. Reported benefit fell from 16/17 for histological neuroprotection to 1/8 for disease onset and 2/12 for lifespan."],
  ["Conclusions.", "EAAT2 up-regulation engages its molecular target and preserves neuronal counts without extending life. For riluzole, however, the same endpoint positively excluded a benefit that exists in patients, and it did so with precision rather than through lack of power. A single well-characterised false negative of that kind is sufficient to show that a null result on this endpoint does not license a conclusion of clinical futility, even though two agents cannot establish a discordance rate. The genetic dissociation between preserved neurons and unchanged lifespan remains the strongest mechanistic constraint, and the PD literature shows the same endpoint-dependent pattern in acute toxin models with no progressive-model or withdrawal data."],
].forEach(([h, b]) => doc.push(P(`**${h}** ${b}`, { after: 160 })));
doc.push(BREAK());

/* ---- Introduction ---- */
doc.push(H1("1. Introduction"));
[
  "Glutamate clearance from the synaptic cleft in the mammalian central nervous system is dominated by a single astrocytic transporter. EAAT2 in humans, GLT-1 in rodents, accounts for the large majority of forebrain and spinal glutamate uptake, and its loss produces a hyperglutamatergic extracellular environment in which neurons are exposed to sustained receptor activation.",
  "The link between this transporter and motor neuron disease was established in the mid-1990s, when selective loss of GLT-1 protein was demonstrated in the motor cortex and spinal cord of patients with amyotrophic lateral sclerosis (ALS) [1]. Focal loss of EAAT2 was subsequently shown to precede and accompany degeneration in the SOD1-G93A transgenic rat [2]. Together these findings supported a straightforward therapeutic hypothesis: if transporter loss drives excitotoxic motor neuron death, restoring transporter expression should be neuroprotective.",
  "The hypothesis acquired a candidate drug in 2005. A screen of 1,040 approved compounds identified 15 β-lactam antibiotics as GLT-1 inducers, with ceftriaxone the most potent, and reported that ceftriaxone delayed loss of strength and body weight and extended survival in SOD1-G93A mice [3]. The finding was influential. More than one hundred subsequent rodent studies have examined ceftriaxone across hyperglutamatergic conditions [4], and the compound entered a three-stage, 514-participant, non-stop phase 1–3 programme in ALS [5]. That programme reported no survival benefit [6].",
  "Two features of the intervening literature deserve attention. First, the same mechanism has been transplanted to Parkinson's disease (PD). Reduced GLT-1 expression is documented in 6-hydroxydopamine (6-OHDA) and MPTP models, and a series of studies since 2012 has reported that ceftriaxone protects nigrostriatal dopaminergic neurons and improves motor behaviour [7–21]. This literature is now large enough to have generated its own narrative review advocating repurposing [22], but it has never been pooled.",
  "Second, the quantitative synthesis that does exist has been directed elsewhere. Behavioural outcomes of β-lactams have been meta-analysed for substance use disorders [23]. The nearest analogue in neurodegeneration is an informatics analysis of 227 SOD1-G93A studies [24], which pools treatments by broad mechanistic category rather than by drug, uses unweighted treated-to-control fold-change ratios rather than variance-weighted effect sizes, and excludes from its primary analysis every data point at which the treated group performed no better than control. Censoring the null and harmful tail of an effect distribution guarantees an upward-biased summary, and analysis at the level of \"excitability\" cannot answer a question about ceftriaxone.",
  "There is therefore a specific and consequential gap. No drug-level, variance-weighted, bias-diagnosed synthesis exists for EAAT2 up-regulators against the two outcomes on which translation depends, which are survival of the animal and survival of the neuron. Filling that gap serves three purposes. It provides an effect-size estimate against which future preclinical studies can be powered. It permits a retrospective test of whether the negative ALS trial was predictable from the animal data, which bears directly on whether the target or the drug failed. And it allows the emerging PD literature to be evaluated before, rather than after, a clinical programme is committed.",
  "We conducted a systematic review and meta-analysis with three prespecified aims: to estimate the pooled effect of EAAT2 up-regulation on lifespan in ALS models; to characterise the PD dopaminergic neuroprotection literature quantitatively, including its susceptibility to selective reporting; and to test whether treatment effects differ systematically across the hierarchy of endpoints from molecular target engagement to death.",
].forEach((t) => doc.push(P(t, { after: 120 })));

/* ---- Methods ---- */
doc.push(H1("2. Methods"));
doc.push(H2("2.1 Reporting and protocol"));
doc.push(P("The review follows PRISMA principles for reporting and CAMARADES conventions for animal-data synthesis. It was not prospectively registered, which is stated as a limitation. To offset the absence of registration, the complete dataset, extraction coding, analysis code and console output are supplied so that any estimate can be independently recomputed or corrected.", { after: 120 }));

doc.push(H2("2.2 Search strategy"));
doc.push(P("Structured searching was conducted to September 2026 combining intervention terms (EAAT2, GLT-1, SLC1A2, ceftriaxone, β-lactam, riluzole, glutamate transporter up-regulation), model terms (SOD1-G93A, TDP-43, FUS, amyotrophic lateral sclerosis, 6-OHDA, MPTP, MPP+, Parkinson) and outcome terms (survival, lifespan, motor neuron, tyrosine hydroxylase, neuroprotection). Reference lists of the identified primary studies, of two recent topic reviews [4,22] and of the phase 3 trial reports [5,6] were hand-searched for additional records.", { after: 120 }));

doc.push(H2("2.3 Eligibility criteria"));
doc.push(P("**Inclusion.** In vivo studies in rodents; intervention whose stated or demonstrated mechanism includes increased EAAT2/GLT-1 expression or function; a transgenic or toxin-induced model of ALS or PD; a concurrent vehicle-treated or untreated control group; and reporting of at least one of lifespan, motor neuron count, or nigrostriatal dopaminergic outcome.", { after: 120 }));
doc.push(P("**Exclusion.** In vitro-only studies; models of other central nervous system disorders; studies without a concurrent control.", { after: 120 }));
doc.push(P("Genetic and viral EAAT2 overexpression were included deliberately rather than treated as background. These experiments constitute the target-validation control for the entire pharmacological programme. If elevating EAAT2 by transgene does not extend life, no agent acting solely through EAAT2 can be expected to do so, and any drug that does extend life is acting through something else.", { after: 120 }));

doc.push(H2("2.4 Data extraction and provenance tiering"));
doc.push(P("Extracted variables were: agent, agent class, mechanistic route, model, species, group sizes, outcome direction, statistical significance as reported by the authors, effect magnitude where available, control group survival, laboratory of origin, and publication year.", { after: 120 }));
doc.push(P("Much of this literature reports effects only graphically or behind paywalls. Rather than treat all extracted values as equivalent, each was assigned a provenance tier. Tier A denotes direction, significance and, where relevant, exact group sizes retrieved verbatim from the source or its abstract, with null results coded as δ = 0. Tier B denotes an effect magnitude retrieved from the source or from an explicit numerical restatement in a review, with group sizes imputed. Tier C denotes a known direction with magnitude inferred from context; such entries were flagged, down-weighted in interpretation, and tested by leave-one-out analysis.", { after: 120 }));
doc.push(P("Of the 12 ALS lifespan comparisons, 9 were Tier A, 2 Tier B and 1 Tier C. Where group sizes were unavailable, the field median of 12 per group was imputed, with sensitivity analysis at n = 8 and n = 20.", { after: 120 }));

doc.push(H2("2.5 Laboratory independence"));
doc.push(P("Each comparison was classified as originating from the laboratory that first reported benefit for that agent in that model, or as an independent replication. This variable was prespecified because non-independence of laboratory is the dominant known source of heterogeneity in preclinical neurodegeneration research and is not captured by conventional risk-of-bias domains.", { after: 120 }));

doc.push(H2("2.6 Effect measures"));
doc.push(P("Lifespan was expressed as Hedges' *g* with the small-sample correction *J*, and in parallel as the normalised mean difference in percent, which is the conventional metric for survival outcomes in animal synthesis and is more interpretable for readers.", { after: 60 }));
doc.push(EQ("g = J (X̄_T − X̄_C) / s_p,   J = 1 − 3 / [4(n_T + n_C − 2) − 1]"));
doc.push(EQ("Var(g) = (n_T + n_C)/(n_T n_C) + g² / [2(n_T + n_C)]"));
doc.push(P("Control-group survival dispersion was anchored on published SOD1-G93A colony data, in which the standard deviation of survival ranges from 9.5 to 12.4 days across genetic backgrounds and sexes [25]. A base case of SD = 9 days was used, with sensitivity analysis across 6 to 14 days.", { after: 120 }));

doc.push(H2("2.7 Synthesis"));
doc.push(P("Random-effects models were fitted by restricted maximum likelihood, with DerSimonian–Laird and Paule–Mandel estimators computed as cross-checks. The Knapp–Hartung adjustment was applied throughout [26]; with k of approximately 12 the conventional normal-theory interval is anticonservative and would overstate precision. Heterogeneity was summarised by Cochran's Q, I², τ² and a 95% prediction interval. Subgroup differences were tested by between-group Q. Cumulative meta-analysis was performed in order of publication year.", { after: 120 }));

doc.push(H2("2.8 Bias diagnostics"));
doc.push(P("Small-study effects were assessed by Egger's regression of the standard normal deviate on precision [27] and by Duval–Tweedie trim-and-fill. Both are recognised to be underpowered at small k and were interpreted accordingly, with primary weight given to the laboratory-independence subgroup analysis and the cumulative analysis.", { after: 120 }));

doc.push(H2("2.9 Power and excess significance"));
doc.push(P("Statistical power was computed from the non-central t distribution. For the PD stratum, where per-study means and standard deviations were not retrievable, the Ioannidis–Trikalinos test of excess significance was applied [28]. This method requires only the number of studies, their sample sizes, the number reporting a significant result, and an assumed true effect, and compares the observed number of positive studies (O) with the number expected (E):", { after: 60 }));
doc.push(EQ("χ² = (O − E)² / E + (O − E)² / (k − E),   E = Σ power_i(θ)"));
doc.push(P("The test was run across a range of assumed true effects rather than at a single value, so that the reader can judge which effect sizes are and are not compatible with the observed pattern of results. The inverse calculation, the minimum true effect consistent with the observed positivity rate, was obtained by inverting the power function.", { after: 120 }));

doc.push(H2("2.10 Sensitivity to the coding of null results"));
doc.push(P("Coding a study reported as non-significant at exactly \u03b4 = 0 forces every such study to a single value and drives within-subgroup heterogeneity to zero by construction. To test whether conclusions depend on this convention, each null study's point estimate was redrawn 10,000 times from N(0, SE\u00b2) truncated at \u00b11.96 SE, which is the range that a reported non-significant result licenses, and the entire model was refitted on each draw. We report the distribution of the pooled estimate, of I\u00b2, and of the between-subgroup p value.", { after: 120 }));

doc.push(H2("2.11 Confounding of laboratory independence with year"));
doc.push(P("Because originating studies are necessarily earlier than the replications they provoke, laboratory independence is expected to be collinear with publication year. We report the point-biserial correlation between the two and fit random-effects meta-regressions with each covariate separately and jointly.", { after: 120 }));

doc.push(H2("2.12 Predictive validity of the mouse lifespan endpoint"));
doc.push(P("Two agents in this class have known outcomes in patients. To assess whether the mouse endpoint anticipated them, mouse estimates were expressed as percentage change in survival and compared with human anchors: for riluzole, a Cochrane-assessed survival gain of approximately two to three months [41], a 9% absolute gain in one-year tracheostomy-free survival and a rise in median tracheostomy-free survival from 11.8 to 14.8 months [40,41], and a 35% mortality reduction at 100 mg in the dose-ranging trial [42]; for ceftriaxone, the null phase 3 result [6]. We also computed whether the mouse confidence intervals excluded the human effect and the power of those studies to detect it. Because mouse lifespan is measured from birth in an animal engineered to die while human survival is measured from randomisation in established disease, both a conservative scaling (human benefit as a fraction of total survival, 6% to 10%) and a direct scaling (median tracheostomy-free survival, +25.4%) were considered.", { after: 120 }));

doc.push(H2("2.13 Software"));
doc.push(P("All estimators were implemented directly from their source equations in Python 3 (NumPy, SciPy) rather than called from an existing meta-analysis package, so that every reported quantity is traceable to a formula in the supplied code. Effect sizes follow Hedges and Olkin [29]. Drafting and consolidation of the analysis code were assisted by a large language model (Claude Opus 5, Anthropic); all scripts were executed and verified by the authors, and every reported quantity derives from the supplied code.", { after: 120 }));

/* ---- Results ---- */
doc.push(H1("3. Results"));
doc.push(H2("3.1 Study selection and characteristics"));
doc.push(P("Twenty-five in vivo studies met inclusion criteria, contributing 12 lifespan comparisons in ALS models and 15 reports of dopaminergic outcome in PD models (Table 1; Supplementary Table S1). One PD report was reclassified out of the efficacy stratum on inspection: it administered ceftriaxone orally at 8 g/kg for five days before the 6-OHDA lesion for the explicit purpose of inducing gut dysbiosis, not as a candidate neuroprotectant [21]. It is analysed separately as a safety observation (Section 3.8), leaving 14 efficacy reports.", { after: 120 }));
doc.push(P("The ALS stratum comprised ceftriaxone (1 comparison) [3], riluzole (9 comparisons across SOD1-G93A, TDP-43-A315T, FUS(1-359) and TDP-43 transgenic rat) [30–34,38,39], transgenic EAAT2 overexpression (1) [35] and lentiviral EAAT2 delivery (1) [36]. The distribution across agents is markedly uneven and constrains what the pooled estimate can be said to describe: riluzole supplies 9 of 12 comparisons (75%), while the ceftriaxone lifespan evidence consists of a single comparison from the originating laboratory, for which no independent rodent replication was identified. The PD stratum comprised ceftriaxone exclusively, across 6-OHDA, MPTP and GLT-1-knockdown models, in rats and mice.", { after: 120 }));

doc.push(H2("3.2 The pooled effect on lifespan is not distinguishable from zero"));
doc.push(P("Three estimators of the between-study variance gave concordant results (Table 2, Figure 1). The random-effects estimate under restricted maximum likelihood with the Knapp–Hartung adjustment was *g* = +0.201 (95% CI −0.079 to +0.481, p = 0.142), with τ² = 0.017 and I² = 22.1%. The 95% prediction interval was −0.20 to +0.61 and Cochran's Q was 14.12 (df = 11, p = 0.226).", { after: 120 }));
doc.push(P("Expressed on the interpretable scale, the pooled change in survival was +1.82% (95% CI −0.41% to +4.05%, p = 0.099). For an animal with a mean lifespan near 128 days this corresponds to approximately 2.3 days, with an interval that includes zero.", { after: 120 }));
doc.push(P("The result was robust to every modelling assumption tested. Across all twelve combinations of assumed survival standard deviation (6, 9, 12 and 14 days) and imputed group size (8, 12 and 20), the pooled *g* ranged from +0.115 to +0.364 and was non-significant in every combination (Supplementary Table S2). Leave-one-out analysis never produced a significant pooled estimate; omitting the two originating positive studies moved the estimate to +0.13 and +0.12 respectively.", { after: 120 }));

doc.push(H2("3.3 Effect size segregates by laboratory of origin"));
doc.push(P("Comparisons from originating laboratories gave *g* = +1.202 (95% CI +0.587 to +1.818), and independent replications gave *g* = +0.051 (95% CI −0.180 to +0.283), a between-subgroup Q of 11.77 (df = 1, p = 0.0006) (Table 3, Figure 1).", { after: 120 }));
doc.push(P("This is a roughly 24-fold difference in effect magnitude. The apparent zero within-subgroup heterogeneity should not be interpreted as a finding: coding null results at exactly δ = 0 forces every replication to the same value and drives I² to zero by construction. Sections 3.9 and 3.10 test whether the subgroup contrast itself survives that convention and whether it can be separated from publication year.", { after: 120 }));
doc.push(P("The replication studies are not underpowered outliers. They include a high-powered reanalysis controlling litter, transgene copy number and sex [30]; a 45-animal study with serial compound muscle action potential recording, motor unit number estimation and electrical impedance myography, which found no difference in onset or survival and in which no measurement modality detected benefit [31]; a 50-animal study in which riluzole alone conferred no benefit and only co-administration with an efflux-transporter inhibitor extended survival [32]; a three-model study using litter-, sex- and age-matched cohorts treated from symptom onset [33]; and a transgenic rat study of a second ALS-linked mutation [34].", { after: 120 }));

doc.push(H2("3.4 The estimate decayed as evidence accumulated"));
doc.push(P("Cumulative meta-analysis showed the pooled estimate falling from *g* = +1.34 after the first study (1996) to *g* = +0.21 after the twelfth (2020), a decline of 84% (Supplementary Figure S1). The cumulative confidence interval last excluded zero in 2008 and has included zero continuously since 2013.", { after: 120 }));
doc.push(P("Egger's regression gave an intercept of +3.42 (SE 1.98; t = 1.72, df = 10, p = 0.115) and trim-and-fill imputed no missing studies. Neither should be read as evidence against small-study bias. At k = 12, with a heavily discretised effect distribution produced by coding null results at zero, both procedures have low sensitivity. The subgroup and cumulative analyses provide a substantially stronger signal.", { after: 120 }));

doc.push(H2("3.5 These experiments could not detect the effects they reported"));
doc.push(P("Median statistical power to detect the pooled effect (*g* = +0.20) at the observed and imputed sample sizes was 7.6%. Achieving 80% power would require 176 animals per group for *g* = 0.3, 64 per group for *g* = 0.5 and 26 per group for *g* = 0.8. No ALS lifespan study in this corpus approaches 64 animals per group. In a literature of this design, positive findings that do occur are, on statistical grounds alone, expected to overestimate the true effect.", { after: 120 }));

doc.push(H2("3.6 Genetic target validation constrains what pharmacology can achieve"));
doc.push(P("Transgenic EAAT2 overexpression crossed onto the SOD1-G93A background produced a statistically significant delay in grip-strength decline and in motor neuron loss, with no effect on paralysis onset, body-weight decline or lifespan [35]. The primary report states this in its title.", { after: 120 }));
doc.push(P("Lentiviral EAAT2 delivery reproduced the dissociation. EAAT2 alone did not prolong survival; only a three-gene combination of EAAT2 with GDH2 and NRF2 extended survival, by 19 to 22 days [36]. These results bound the pharmacological programme independently of any drug's pharmacokinetics, brain penetration or off-target activity.", { after: 120 }));

doc.push(H2("3.7 The Parkinson's disease stratum"));
doc.push(P("Fourteen efficacy reports were identified, all of ceftriaxone, and all fourteen reported a statistically significant protective effect on dopaminergic or behavioural endpoints [7–20].", { after: 120 }));
doc.push(P("Eight research groups produced the fourteen efficacy reports, and one group contributed five (36% of the stratum); reports from a single group share model, animal pipeline and analyst and are not statistically independent. Most were conducted in rats, with no non-rodent and no aged-animal data. Median group size was 8.", { after: 120 }));
doc.push(P("The design limitation of this stratum is not, as might be supposed, the absence of a survival endpoint. Rodents do not die of 6-OHDA or MPTP parkinsonism, and mortality in these paradigms reflects systemic toxicity rather than disease, so a survival endpoint would be the wrong experiment. The actual deficiencies are that every included study used an acute or subacute toxin lesion, none used a progressive or synucleinopathy model, none tested whether benefit persists after treatment withdrawal, and none followed animals long enough to distinguish delayed from prevented degeneration. A further limitation is that the method of dopaminergic quantification, and specifically whether unbiased stereological cell counts were performed rather than tyrosine hydroxylase immunoreactivity or optical density, was not determinable from retrieved records for most studies. Since tyrosine hydroxylase expression is regulated and can be modulated pharmacologically without any change in cell number, the histological neuroprotection claim in this stratum is weaker than a cell-survival claim would be.", { after: 120 }));
doc.push(P("At the observed sample sizes, a 14 of 14 success rate requires a true standardised effect of *g* ≥ 2.73 (Figure 2a). The Ioannidis–Trikalinos test rejected the null for every assumed true effect up to *g* = 1.0 (Table 4, Figure 2b), and only at *g* ≥ 1.5 does the observed pattern become statistically unremarkable. The result is not driven by the dominant research group: excluding its five reports leaves χ² = 9.61, p = 0.002 at an assumed *g* = 1.0, and collapsing the stratum to one observation per group (k = 8) leaves χ² = 9.34, p = 0.002.", { after: 120 }));
doc.push(P("Two interpretations remain open and the data cannot distinguish them. Effects of that magnitude are attainable in acute toxin models: when 6-OHDA ablates more than 80% of striatal tyrosine hydroxylase signal, the lesioned control group sits near a floor with compressed variance, and partial rescue can generate very large standardised effects. Alternatively, selective reporting has inflated a moderate effect. Both readings converge on the same translational conclusion, developed in Section 4.5.", { after: 120 }));

doc.push(H2("3.8 A route- and dose-dependent safety signal"));
doc.push(P("The reclassified report is informative in its own right [21]. Ceftriaxone given orally at 8 g/kg for five days before an intrastriatal 6-OHDA lesion produced gut dysbiosis, colonic damage, endotoxaemia and systemic inflammation, and worsened both motor deficits and striatal tyrosine hydroxylase expression relative to 6-OHDA alone; ceftriaxone alone did not impair motor function. The same drug that is reported as protective when given systemically therefore aggravated dopaminergic outcomes when given by the route that repurposing would most plausibly use, at a dose chosen to disturb the microbiome. This is a single study and its dose is far above therapeutic exposure, but it identifies route and microbiome effects as a safety question that the efficacy literature has not addressed.", { after: 120 }));

doc.push(H2("3.9 Reported benefit declines along the endpoint hierarchy"));
doc.push(P("Pooling both strata by outcome domain produced a monotonic gradient, from 16 of 17 assessments reporting benefit for histological neuroprotection, through 13 of 20 for short-term motor endpoints, to 1 of 8 for disease onset and 2 of 12 for lifespan (Supplementary Table S3, Figure 2c). Target engagement was reported in every study that assessed it, but this row is excluded from the trend: a report that a GLT-1 inducer failed to induce GLT-1 would be unlikely to be published or to enter this corpus, so the figure measures publication practice rather than biology. It is retained in Supplementary Table S3 for completeness and marked as non-informative.", { after: 120 }));

/* ---- Discussion ---- */
doc.push(H2("3.10 The subgroup contrast survives realistic scatter in the null studies"));
doc.push(P("Redrawing each null study's point estimate from N(0, SE\u00b2) truncated at \u00b11.96 SE and refitting the model 10,000 times gave a median pooled *g* of +0.223 (2.5th to 97.5th centile +0.071 to +0.369), close to the deterministic estimate of +0.201 (Supplementary Table S4, Figure 3a). The pooled effect reached significance in only 13.1% of simulations, so the primary null conclusion is unchanged. Heterogeneity rose, as expected, from I\u00b2 = 22.1% under the deterministic coding to a median of 44.0%, confirming that the earlier figure understated it.", { after: 120 }));
doc.push(P("The subgroup contrast was not an artifact of the coding. The originating subgroup had a median *g* of +1.202 and the independent subgroup a median of +0.053 (2.5th to 97.5th centile \u22120.132 to +0.238), and the between-subgroup test remained significant in 100% of simulations with a median p of 0.0006.", { after: 120 }));

doc.push(H2("3.11 Laboratory independence cannot be fully separated from publication year"));
doc.push(P("The two originating comparisons date from 1996 and 2005, while eight of the ten independent replications are from 2008 or later, giving a point-biserial correlation between independence and year of +0.64 (p = 0.024) (Figure 3b). Fitted separately, both covariates predicted effect size: year alone gave \u03b2 = \u22120.047 per year (p = 0.007) and independence alone \u03b2 = \u22121.150 (p = 0.001). Fitted jointly, independence retained significance (\u03b2 = \u22120.920, p = 0.041) while year did not (\u03b2 = \u22120.018, p = 0.414), which favours laboratory independence as the operative variable. With k = 12 and this degree of collinearity, however, the two explanations cannot be definitively separated, and a secular improvement in preclinical rigour remains a plausible alternative account. Treatment timing is a further unmeasured confounder: both originating studies dosed pre-symptomatically, whereas the most rigorous replication dosed from symptom onset.", { after: 120 }));

doc.push(H2("3.12 Discordance between the murine endpoint and clinical outcome"));
doc.push(P("Two agents in this class have known outcomes in patients. The murine lifespan endpoint was discordant with both, but the two cases differ greatly in evidential weight and are therefore reported separately (Table 5, Figure 3c).", { after: 120 }));
doc.push(P("**The ceftriaxone case is suggestive but weak.** The single originating mouse study reported a +7.8% survival gain and the 514-participant phase 3 trial found no survival benefit [6]. This is consistent with a false positive, but it rests on one unreplicated comparison, and an unreplicated positive that fails in the clinic is the ordinary and expected consequence of low power and selective reporting rather than a property of the endpoint. It adds little on its own.", { after: 120 }));
doc.push(P("**The riluzole case is decisive, and stands independently of the first.** Pooled across eight independent replications the mouse estimate was +0.52% (95% CI \u22120.80% to +1.84%), with a pooled standard error of 0.56%. In patients, riluzole prolongs survival by approximately two to three months, roughly 6% to 10% of total survival, with a 9% absolute gain in one-year tracheostomy-free survival and median tracheostomy-free survival rising from 11.8 to 14.8 months [40,41], and a 35% mortality reduction at 100 mg in the dose-ranging trial [42].", { after: 120 }));
doc.push(P("Expressed against the pooled precision actually achieved, the most conservative human scaling of 5.6% lies 9.0 pooled standard errors above the mouse estimate, and the upper scaling of 10% lies 17.0 standard errors above it (Supplementary Table S5). The exclusion does not depend on which human figure is preferred: the mouse interval is incompatible with any human benefit exceeding about 1.8% of total survival, or roughly three weeks on a 36-month course. Even a deliberately sceptical human effect of 0.7 months remains excluded.", { after: 120 }));
doc.push(P("A distinction matters here that the power analysis in Section 3.5 does not capture. The individual replications were not uniformly well powered: at n = 12 per group, power to detect the conservative 5.6% scaling was only 46%, rising to 91% at the 10% scaling. Pooling them, however, achieved a precision that no single study had, and it is the pooled interval that excludes the human effect. The false negative is therefore a property of the accumulated literature rather than of any one experiment, and it is a positive exclusion rather than an absence of evidence.", { after: 120 }));
doc.push(P("**What two agents cannot support.** It is tempting to combine these cases into a statement about the predictive validity of the endpoint, and we resist it. With no concordant agent out of two, the exact 95% confidence interval for the concordance rate runs from 0% to 84%, which is to say that the rate is not estimable from this evidence and is compatible with an endpoint that is usually right. The defensible claim is narrower and rests on the riluzole case alone: this endpoint has been shown, on one well-characterised occasion, to exclude with precision a survival benefit that exists in patients. That is sufficient to establish that a null result here does not license an inference of clinical futility. It is not sufficient to characterise how often the endpoint misleads, and a systematic concordance analysis across the wider SOD1-G93A therapeutic literature would be required for that.", { after: 120 }));
doc.push(P("One further observation is uncomfortable for the interpretation offered in Section 3.3 and is reported rather than set aside. The originating studies assigned riluzole a mouse benefit of +9.8%, which is closer to the human value than the rigorous replications achieved. Replication and methodological rigour improved the internal validity of these experiments without improving their correspondence to the clinical outcome. We do not think this rehabilitates the originating studies, whose precision was poor and whose result for ceftriaxone did not survive contact with a trial, but it does caution against treating independent replication as equivalent to clinical truth.", { after: 120 }));

doc.push(H1("4. Discussion"));
doc.push(H2("4.1 Principal findings"));
doc.push(P("Four results carry the analysis. The pooled effect of EAAT2 up-regulation on lifespan in rodent ALS models is +1.8%, with a confidence interval that includes zero and that is insensitive to every extraction and modelling assumption tested, including realistic scatter in the null studies. Essentially all of the apparent effect is attributable to originating rather than replicating laboratories, although this variable is collinear with publication year. Across both disease strata, benefit attenuates systematically as endpoints move from histology toward death, and genetic overexpression reproduces that dissociation. And, most consequentially for how this literature should be used, the accumulated murine lifespan evidence positively excludes riluzole's real clinical benefit, establishing that a null result on this endpoint does not license an inference of clinical futility.", { after: 120 }));
doc.push(P("The fourth result constrains what the first three license. A null pooled estimate on an endpoint that has been shown, in this same dataset, to exclude a benefit that exists in patients is not evidence that a drug class is futile. It is evidence that this endpoint cannot settle the question on its own. That is a claim about the sufficiency of the endpoint, not an estimate of how often it misleads, which two agents cannot provide.", { after: 120 }));

doc.push(H2("4.2 Relation to previous work"));
doc.push(P("The present estimate is substantially lower than the impression conveyed by the primary literature, and the reason is methodological rather than substantive. The one prior large-scale synthesis in this space [24] reports that excitability-directed treatments perform well in SOD1-G93A mice. That analysis restricted its primary results to data points at which the treated group performed at least as well as control, analysing the 1,624 points below that threshold separately. Under a true null, roughly half of observed effects fall below control through sampling variation alone, so discarding them shifts the summary upward irrespective of the true effect. Applying that exclusion rule to simulated literatures with the sampling variances of the present dataset and a true effect of exactly zero returns a mean pooled *g* of +0.31 (2.5th to 97.5th centile +0.13 to +0.53), exceeding the observed pooled estimate of +0.20 in 86% of simulations. The apparent benefit of excitability-directed treatments is therefore recoverable from the analysis rule alone.", { after: 120 }));
doc.push(P("The narrative review of ceftriaxone in PD [22] catalogues fourteen positive reports and concludes that repurposing is promising. The same fourteen reports, analysed with attention to sample size and independence, support a more cautious reading.", { after: 120 }));

doc.push(H2("4.3 Mechanistic interpretation"));
doc.push(P("Two explanations fit the endpoint gradient, and they are not mutually exclusive.", { after: 120 }));
doc.push(P("The first is that EAAT2-dependent excitotoxicity contributes to a component of neuronal injury that is not rate-limiting for death. Under this reading the transporter is a genuine but subordinate node: relieving glutamate load reduces one stressor while leaving proteostatic, mitochondrial and axonal failure intact.", { after: 120 }));
doc.push(P("The second is that preserved neuronal counts do not indicate preserved neuronal function. In ALS models, motor unit loss and neuromuscular junction denervation precede and dissociate from soma loss [37]. A neuron whose soma remains immunopositive but whose distal axon has retracted contributes to a histological count without contributing to motor function or to survival. The same concern applies with additional force in the PD stratum, where every included study used tyrosine hydroxylase immunoreactivity or cell counts as the neuroprotection endpoint. Tyrosine hydroxylase expression is itself regulated and can be pharmacologically modulated independently of cell survival, so a treatment that raises tyrosine hydroxylase signal may be reporting phenotype rescue rather than rescued cells.", { after: 120 }));
doc.push(P("Distinguishing these possibilities requires functional readouts alongside counts. The one included ALS study that applied serial motor unit number estimation and compound muscle action potential recording found no benefit by any modality [31].", { after: 120 }));
doc.push(P("The genetic experiments make the constraint concrete. Transgenic and viral EAAT2 overexpression produce the same dissociation as the drugs [35,36]. This is not a pharmacokinetic problem to be solved by better brain penetration or a more selective molecule. It is a property of the target in these models.", { after: 120 }));

doc.push(H2("4.4 Implications for the clinical programme in ALS"));
doc.push(P("The phase 3 ceftriaxone trial in ALS was negative [6], and the preclinical survival evidence supporting it was thin: a single originating comparison, no independent rodent replication, and a literature in which the median experiment had 7.6% power to detect its own pooled effect. To that extent the failure was foreseeable.", { after: 120 }));
doc.push(P("It does not follow that a null mouse result should be read as a prediction of clinical futility, and the riluzole case in this same dataset shows why. Had the eight independent replications of riluzole been available before its clinical development, and had they been read as decisive, they would have argued against advancing the only agent that has since become standard of care. The asymmetry of costs matters: a false positive costs a failed trial, which is recoverable, while a false negative costs a treatment that is never developed, which is not. We therefore argue that murine lifespan should inform but not arbitrate development decisions in this class, and that a null result in particular carries less evidential weight than it is usually given. We stop short of a general claim about the endpoint's accuracy, which this dataset cannot support.", { after: 120 }));
doc.push(P("A related observation concerns the transmission of evidence rather than its generation, and is offered descriptively. The published abstract of the trial states, as part of its background, that EAAT2 overexpression in animal models \u201cdelays disease onset and prolongs survival\u201d [6]. The single-gene genetic experiment reports no effect on lifespan, paralysis onset or body-weight decline, and says so in its title [35]. A survival benefit from EAAT2-containing gene therapy has been reported, but only for a three-gene combination and not for EAAT2 alone [36]. We make no inference about intent, and the trial background may have drawn on the combined literature; the point is simply that no single-gene EAAT2 experiment supports a survival claim, and that a systematic synthesis of the preclinical evidence before the trial would have made that visible.", { after: 120 }));
doc.push(P("The trial also lacked a pharmacodynamic marker of EAAT2 up-regulation in participants and therefore could not distinguish target failure from drug failure [6]. Development of an EAAT2 positron emission tomography ligand remains the single intervention most likely to make the next negative trial interpretable.", { after: 120 }));

doc.push(H2("4.5 Implications for Parkinson's disease"));
doc.push(P("The PD literature currently occupies the position the ALS literature occupied around 2007: a striking initial finding, an accumulating series of same-group replications on surrogate endpoints, convincing molecular target engagement, and deferral of the hard endpoint. Its deficiencies are specific to the models it uses. Every included study used an acute or subacute toxin lesion; none used a progressive or synucleinopathy model; none tested persistence of benefit after withdrawal; none used aged animals despite age being the dominant risk factor; and, unlike the ALS field, the PD literature has no genetic target-validation experiment testing whether EAAT2 elevation alters disease course. We do not fault this literature for omitting a survival endpoint, which would be biologically inappropriate in non-lethal lesion models.", { after: 120 }));
doc.push(P("Both interpretations of the excess-significance result converge here. If the true effect against acute toxin-induced dopaminergic loss is genuinely *g* of 2 or more, that is a statement about resistance to an acute chemical insult delivered over days, and the ALS stratum demonstrates what happens when the same mechanism is asked to modify a chronic degenerative course. If instead the effect has been inflated by selective reporting, the true effect is smaller than published and no study in the corpus was powered to estimate it. Under either reading the current evidence does not support a disease-modification claim. The reclassified dysbiosis experiment [21] adds a distinct concern: the route most plausible for repurposing is oral, and high-dose oral ceftriaxone worsened dopaminergic outcomes through the gut in the one study that examined it.", { after: 120 }));

doc.push(H2("4.6 Limitations"));
[
  "**Extraction depth.** Effect magnitudes for the two positive ALS studies are Tier B, taken from numerical restatements rather than from the original figures, and group sizes were imputed for eight of twelve comparisons. Sensitivity analysis shows the qualitative conclusion is stable across the plausible range, but point estimates would shift with full-text extraction. Both Tier B entries are positive studies, so correction can move the pooled estimate downward but not upward.",
  "**Coding of null results.** Studies reporting no significant survival effect were coded as δ = 0. True point estimates are distributed around zero and some are negative, so this convention biases the pooled estimate slightly upward. The true effect is, if anything, smaller than +0.20.",
  "**Survival metric.** Individual-animal and Kaplan–Meier data were not available. Survival is more appropriately synthesised as a hazard ratio; mean-difference synthesis is a second-best approximation imposed by what is reported.",
  "**The PD stratum was not pooled as an effect size.** Per-study means and standard deviations were not retrievable, so this stratum rests on count-based and significance-based methods. This is a genuine limitation, although the excess-significance and power analyses are the appropriate tools when summary statistics are unavailable and do not require them.",
  "**Underpowered bias tests.** Egger's test and trim-and-fill at k = 12 should not be interpreted as reassurance.",
  "**Riluzole is not a selective EAAT2 agent.** It blocks persistent sodium current and inhibits presynaptic glutamate release in addition to any transporter effect, and its inclusion broadens the mechanistic class. The conclusion does not depend on it: the riluzole-only pooled estimate is itself null (*g* = +0.17, 95% CI −0.10 to +0.44), and the ceftriaxone and genetic-overexpression evidence point in the same direction.",
  "**The effect measure is close to a rescaling of the reported day difference.** Because a common standard deviation is imputed across studies, Hedges' *g* is approximately \u03b4 divided by a constant, and the inverse-variance weights are driven largely by imputed group size rather than by observed dispersion. The analysis is therefore closer to a weighted average of reported day differences than the machinery implies, and should be read as such.",
  "**The concordance analysis rests on two agents.** Only riluzole and ceftriaxone have both murine lifespan data in this corpus and a known clinical outcome. With no concordant agent out of two, the exact 95% confidence interval for the concordance rate spans 0% to 84%, so no rate of discordance is estimable and the endpoint may well be accurate for most agents. The claim we make is restricted to the sufficiency of a null result, and rests on the riluzole exclusion alone, which is robust to the choice of human effect scaling. Establishing predictive validity as a general property would require a systematic concordance analysis across the wider SOD1-G93A therapeutic literature against all agents subsequently tested in patients, which is a separate study.",
  "**Exploratory multiplicity.** Subgroup, agent-level, cumulative, leave-one-out, sensitivity and excess-significance analyses are reported without adjustment for multiple comparisons. All are exploratory and should be treated as hypothesis-generating rather than confirmatory.",
  "**Prediction interval.** Computed with \u03c4\u00b2 near zero at k = 12, the prediction interval is optimistically narrow; the Monte-Carlo analysis, which raised median I\u00b2 to 44%, indicates the deterministic model understated between-study variance.",
  "**Pooling a genetic cross with drug comparisons.** The EAAT2 transgenic experiment compares single- with double-transgenic littermates rather than drug with vehicle. Its inclusion is justified on target-validation grounds, but the comparator structure differs and leave-one-out analysis confirms it does not drive the pooled result.",
  "**The excess-significance test assumes a common true effect** across 6-OHDA, MPTP and GLT-1-knockdown models, which is unlikely to hold. Its output should be read as a description of how implausible the observed uniformity is under a range of assumed effects, not as an estimate of any single effect.",
  "**Risk of bias was not formally scored.** Design features determinable from retrieved records are reported in the supplementary file als_design_features.csv, and the dominant finding is that most SYRCLE domains were not determinable without full-text review. Randomisation, allocation concealment and blinded outcome assessment could be established for almost no study. A completed SYRCLE assessment requires full-text retrieval and is outstanding.",
  "**Search and appraisal.** Searching was systematic but conducted by a single reviewer without dual independent screening, and PRISMA flow counts were not recorded prospectively. A publication-ready version requires both, together with prospective registration.",
].forEach((t) => doc.push(P(t, { after: 120 })));

doc.push(H2("4.7 Recommendations"));
doc.push(P("**For interpretation.** The claim that EAAT2 up-regulation is neuroprotective should be separated into two claims with very different evidential support. That it preserves neuronal counts is well supported. That it modifies disease course is unsupported in ALS and untested in PD. Neither claim, however, should be settled by SOD1-G93A lifespan data alone, in either direction.", { after: 120 }));
doc.push(P("**For trial design.** Survival should not be adopted as a primary endpoint for an EAAT2 up-regulator on the strength of the current preclinical base, and equally, a null mouse survival result should not by itself veto clinical development. The data support a function-preservation hypothesis, testable with strength, grip, motor score and time-to-functional-milestone endpoints. Decisions to advance or abandon an agent in this class should rest on mechanistic target validation, pharmacodynamic evidence of engagement in humans, and early-phase functional signals rather than on rodent lifespan.", { after: 120 }));
doc.push(P("**For the next preclinical experiment.** Specifically: at least 64 animals per group to detect *g* = 0.5 at 80% power, distributed across at least two sites; randomisation, allocation concealment, blinded outcome assessment and a pre-registered primary endpoint, none of which are standard in the corpus reviewed here; litter, sex and transgene copy number handled as covariates; treatment initiated after symptom onset, given that fewer than 5% of SOD1-G93A therapeutic studies do so while every patient is treated post-onset; a functional readout of the neurons being counted, such as motor unit number estimation, compound muscle action potential recording or neuromuscular junction innervation; and, for PD, a progressive or synucleinopathy model, unbiased stereological cell counts rather than tyrosine hydroxylase immunoreactivity alone, aged animals, a treatment-withdrawal arm to distinguish delayed from prevented degeneration, and evaluation by the oral route given the safety signal in Section 3.8.", { after: 120 }));

doc.push(H1("5. Conclusions"));
doc.push(P("EAAT2 up-regulation is a well-validated molecular intervention supporting a poorly validated therapeutic claim. Pooled across rodent ALS models it changes lifespan by 1.8% (95% CI \u22120.4% to +4.1%), and the apparent effect is almost entirely attributable to originating rather than replicating laboratories. Genetic target validation reproduces the same dissociation between preserved neurons and unchanged lifespan, indicating a property of the target rather than a limitation of any particular drug.", { after: 120 }));
doc.push(P("The endpoint on which these conclusions rest, however, was discordant with clinical outcome for both agents in this class whose outcome is known. The riluzole case is the substantive one: the accumulated murine evidence excludes, with a precision of 0.56% and by a margin of nine pooled standard errors, a survival benefit that riluzole demonstrably confers on patients. The SOD1-G93A lifespan measure is therefore not simply noisy or biased upward. On at least one occasion it has been confidently wrong in the direction that stops development, and additional methodological rigour applied to that endpoint would not have corrected it.", { after: 120 }));
doc.push(P("The strategy is not refuted. It is mis-specified, and so is the instrument used to judge it. EAAT2 up-regulation merits continued investigation as a means of preserving neuronal function for longer, evaluated with function-preserving endpoints, adequate power, and pharmacodynamic confirmation of target engagement in humans. It should no longer be described as neuroprotective in a sense the data have not supported, and rodent lifespan should no longer be treated as the arbiter of whether it works.", { after: 120 }));

/* ---- Declarations ---- */
doc.push(H1("Declarations"));
doc.push(P("**Funding.** None.", { after: 100 }));
doc.push(P("**Competing interests.** A.K. and T.K. hold invention disclosures and pending patents spanning two technology areas unrelated to this study: macromolecular structures for neurological indications; responsive biomaterials for microenvironment-targeted delivery. A.K. is an incoming Novo Nordisk AI Fellow at MIT, starting November 2026. T.K. holds an Anthropic AI for Science award for work unrelated to this study; the large language model used in this work (\u00a72.13) is a product of Anthropic, and is disclosed here for completeness. This research received no financial or operational support from these entities, and none from the intellectual property or fellowship funding named above.", { after: 100 }));
doc.push(P("**Author contributions.** A.K. and T.K. \u2014 roles to be assigned per the CRediT taxonomy (conceptualisation, methodology, software, formal analysis, data curation, writing \u2014 original draft, writing \u2014 review and editing, visualisation).", { after: 100 }));
doc.push(P("**Prior presentation.** Preliminary findings were presented as a late-breaking abstract at the Society for Neuroscience annual meeting, 2026.", { after: 100 }));
doc.push(P("**Registration.** Not prospectively registered.", { after: 100 }));
doc.push(P("**Data availability.** Supplementary Tables S1 to S5 and Supplementary Figure S1 are provided in a separate supplementary document. The complete dataset (als_lifespan.csv, pd_dopaminergic.csv, outcome_domains.csv), analysis code (metalib.py, run_analysis.py, make_figures.py), computed per-study effect sizes, full console output and machine-readable results are provided as supplementary material. All estimates regenerate with a single command; correcting an extraction and re-running updates all downstream estimates, figures and sensitivity analyses automatically.", { after: 100 }));

/* ---- Generative AI declaration (placed before the reference list) ---- */
doc.push(H1("Declaration of generative AI and AI-assisted technologies in the manuscript preparation process"));
doc.push(P("During the preparation of this work, the authors used Claude Opus 5 (Anthropic) for drafting and for streamlining the analysis code. The authors reviewed and edited the output as needed and take full responsibility for the content of the published article.", { after: 120 }));

/* ---- References ---- */
doc.push(BREAK(), H1("References"));
const refs = [
"Rothstein JD, Van Kammen M, Levey AI, Martin LJ, Kuncl RW. Selective loss of glial glutamate transporter GLT-1 in amyotrophic lateral sclerosis. Ann Neurol. 1995;38(1):73–84.",
"Howland DS, Liu J, She Y, Goad B, Maragakis NJ, Kim B, et al. Focal loss of the glutamate transporter EAAT2 in a transgenic rat model of SOD1 mutant-mediated amyotrophic lateral sclerosis (ALS). Proc Natl Acad Sci USA. 2002;99(3):1604–1609.",
"Rothstein JD, Patel S, Regan MR, Haenggeli C, Huang YH, Bergles DE, et al. Beta-lactam antibiotics offer neuroprotection by increasing glutamate transporter expression. Nature. 2005;433(7021):73–77.",
"Smaga I, Fierro D, Mesa J, Filip M, Knackstedt LA. Molecular changes evoked by the beta-lactam antibiotic ceftriaxone across rodent models of substance use disorder and neurological disease. Neurosci Biobehav Rev. 2020;115:116–130.",
"Berry JD, Shefner JM, Conwit R, et al. Design and initial results of a multi-phase randomized trial of ceftriaxone in amyotrophic lateral sclerosis. PLoS One. 2013;8(4):e61177.",
"Cudkowicz ME, Titus S, Kearney M, Yu H, Sherman A, Schoenfeld D, et al. Safety and efficacy of ceftriaxone for amyotrophic lateral sclerosis: a multi-stage, randomised, double-blind, placebo-controlled trial. Lancet Neurol. 2014;13(11):1083–1091.",
"Leung TC, Lui CN, Chen LW, Yung WH, Chan YS, Yung KK. Ceftriaxone ameliorates motor deficits and protects dopaminergic neurons in 6-hydroxydopamine-lesioned rats. ACS Chem Neurosci. 2012;3(1):22–30.",
"Chotibut T, Davis RW, Arnold JC, et al. Ceftriaxone increases glutamate uptake and reduces striatal tyrosine hydroxylase loss in 6-OHDA Parkinson's model. Mol Neurobiol. 2014;49(3):1282–1292.",
"Bisht R, Kaur B, Gupta H, Prakash A. Ceftriaxone mediated rescue of nigral oxidative damage and motor deficits in MPTP model of Parkinson's disease in rats. Neurotoxicology. 2014;44:71–79.",
"Ho SC, Hsu CC, Pawlak CR, et al. Effects of ceftriaxone on the behavioral and neuronal changes in an MPTP-induced Parkinson's disease rat model. Behav Brain Res. 2014;268:177–184.",
"Kelsey JE, Neville C. The effects of the beta-lactam antibiotic, ceftriaxone, on forepaw stepping and L-DOPA-induced dyskinesia in a rodent model of Parkinson's disease. Psychopharmacology (Berl). 2014;231(12):2405–2415.",
"Hsu CY, Hung CS, Chang HM, Liao WC, Ho SC, Ho YJ. Ceftriaxone prevents and reverses behavioral and neuronal deficits in an MPTP-induced animal model of Parkinson's disease dementia. Neuropharmacology. 2015;91:43–56.",
"Huang CK, Chang YT, Amstislavskaya TG, et al. Synergistic effects of ceftriaxone and erythropoietin on neuronal and behavioral deficits in an MPTP-induced animal model of Parkinson's disease dementia. Behav Brain Res. 2015;294:198–207.",
"Weng JC, Tikhonova MA, Chen JH, et al. Ceftriaxone prevents the neurodegeneration and decreased neurogenesis seen in a Parkinson's disease rat model: an immunohistochemical and MRI study. Behav Brain Res. 2016;305:126–139.",
"Chotibut T, Meadows S, Kasanga EA, et al. Ceftriaxone reduces L-dopa-induced dyskinesia severity in 6-hydroxydopamine Parkinson's disease model. Mov Disord. 2017;32(11):1547–1556.",
"Kaur B, Prakash A. Ceftriaxone attenuates glutamate-mediated neuro-inflammation and restores BDNF in MPTP model of Parkinson's disease in rats. Pathophysiology. 2017;24(2):71–79.",
"Hsieh MH, Meng WY, Liao WC, et al. Ceftriaxone reverses deficits of behavior and neurogenesis in an MPTP-induced rat model of Parkinson's disease dementia. Brain Res Bull. 2017;132:129–138.",
"Zhou X, Lu J, Wei K, et al. Neuroprotective effect of ceftriaxone on MPTP-induced Parkinson's disease mouse model by regulating inflammation and intestinal microbiota. Oxid Med Cell Longev. 2021;2021:9424582.",
"Ren C, He KJ, Hu H, et al. Induction of Parkinsonian-like changes via targeted downregulation of astrocytic glutamate transporter GLT-1 in the striatum. J Parkinsons Dis. 2022;12(1):295–314.",
"Zhi H, Wang X, Chen Y, Cai Z, Li J, Guo D. Ceftriaxone affects ferroptosis and alleviates glial cell activation in Parkinson's disease. Int J Mol Med. 2025;55(6).",
"Avagliano C, Coretti L, Lama A, Pirozzi C, De Caro C, De Biase D, et al. Dual-hit model of Parkinson's disease: impact of dysbiosis on 6-hydroxydopamine-insulted mice \u2014 neuroprotective and anti-inflammatory effects of butyrate. Int J Mol Sci. 2022;23(12):6367.",
"Wen P, Dou L, Yang X, Han D, Wang J, Wu H, Ren C. Ceftriaxone's multifaceted neuroprotection in Parkinson's disease: preclinical evidence and implications for drug repurposing. Drug Des Devel Ther. 2026;20:626484.",
"Alasmari MS, Almohammed OA, Hammad AM, et al. Effects of beta lactams on behavioral outcomes of substance use disorders: a meta-analysis of preclinical studies. Neuroscience. 2024;537:58–83.",
"Lee AJB, Kittel TE, Kim RB, Bach TN, Zhang T, Mitchell CS. Comparing therapeutic modulators of the SOD1 G93A amyotrophic lateral sclerosis mouse pathophysiology. Front Neurosci. 2023;16:1111763.",
"Heiman-Patterson TD, Deitch JS, Blankenhorn EP, Erwin KL, Perreault MJ, Alexander BK, et al. Background and gender effects on survival in the TgN(SOD1-G93A)1Gur mouse model of ALS. J Neurol Sci. 2005;236(1–2):1–7.",
"Knapp G, Hartung J. Improved tests for a random effects meta-regression with a single covariate. Stat Med. 2003;22(17):2693–2710.",
"Egger M, Davey Smith G, Schneider M, Minder C. Bias in meta-analysis detected by a simple, graphical test. BMJ. 1997;315(7109):629–634.",
"Ioannidis JPA, Trikalinos TA. An exploratory test for an excess of significant findings. Clin Trials. 2007;4(3):245–253.",
"Hedges LV, Olkin I. Statistical Methods for Meta-Analysis. Orlando: Academic Press; 1985.",
"Scott S, Kranz JE, Cole J, Lincecum JM, Thompson K, Kelly N, et al. Design, power, and interpretation of studies in the standard murine model of ALS. Amyotroph Lateral Scler. 2008;9(1):4–15.",
"Li J, Sung M, Rutkove SB. Electrophysiologic biomarkers for assessing disease progression and the effect of riluzole in SOD1 G93A ALS mice. PLoS One. 2013;8(6):e65976.",
"Jablonski MR, Markandaiah SS, Jacob D, Meng NJ, Li K, Gennaro V, et al. Inhibiting drug efflux transporters improves efficacy of ALS therapeutics. Ann Clin Transl Neurol. 2014;1(12):996–1005.",
"Hogg MC, Halang L, Woods I, Coughlan KS, Prehn JHM. Riluzole does not improve lifespan or motor function in three ALS mouse models. Amyotroph Lateral Scler Frontotemporal Degener. 2018;19(5–6):438–445.",
"Chen S, Liao Q, Lu K, Zhou J, Huang C, Bi F. Riluzole exhibits no therapeutic efficacy on a transgenic rat model of amyotrophic lateral sclerosis. Curr Neurovasc Res. 2020;17(3):275–285.",
"Guo H, Lai L, Butchbach ME, Stockinger MP, Shan X, Bishop GA, Lin CL. Increased expression of the glial glutamate transporter EAAT2 modulates excitotoxicity and delays the onset but not the outcome of ALS in mice. Hum Mol Genet. 2003;12(19):2519–2532.",
"Benkler C, Barhum Y, Ben-Zur T, Offen D. Multifactorial gene therapy enhancing the glutamate uptake system and reducing oxidative stress delays symptom onset and prolongs survival in the SOD1-G93A ALS mouse model. J Mol Neurosci. 2016;58(1):46–58.",
"Hegedus J, Putman CT, Tyreman N, Gordon T. Preferential motor unit loss in the SOD1 G93A transgenic mouse model of amyotrophic lateral sclerosis. J Physiol. 2008;586(14):3337–3351.",
"Gurney ME, Cutting FB, Zhai P, Doble A, Taylor CP, Andrus PK, Hall ED. Benefit of vitamin E, riluzole, and gabapentin in a transgenic model of familial amyotrophic lateral sclerosis. Ann Neurol. 1996;39(2):147–157.",
"Waibel S, Reuter A, Malessa S, Blaugrund E, Ludolph AC. Rasagiline alone and in combination with riluzole prolongs survival in an ALS mouse model. J Neurol. 2004;251(9):1080–1084.",
"Bensimon G, Lacomblez L, Meininger V; ALS/Riluzole Study Group. A controlled trial of riluzole in amyotrophic lateral sclerosis. N Engl J Med. 1994;330(9):585–591.",
"Miller RG, Mitchell JD, Moore DH. Riluzole for amyotrophic lateral sclerosis (ALS)/motor neuron disease (MND). Cochrane Database Syst Rev. 2012;(3):CD001447.",
"Fang T, Al Khleifat A, Meurgey JH, Jones A, Leigh PN, Bensimon G, Al-Chalabi A. Stage at which riluzole treatment prolongs survival in patients with amyotrophic lateral sclerosis: a retrospective analysis of data from a dose-ranging study. Lancet Neurol. 2018;17(5):416–422.",
];
refs.forEach((r, i) => doc.push(REF(i + 1, r)));

/* ---- Tables ---- */
doc.push(BREAK(), H1("Tables"));
doc.push(TCAP(1, "Characteristics of the 12 included comparisons in the ALS lifespan stratum."));
doc.push(mkTable(
  ["Study", "Agent", "Model", "Δ survival (d)", "g (95% CI)", "Indep.", "Tier"],
  [
    ["Gurney 1996 [38]", "Riluzole", "SOD1-G93A", "+12.5", "+1.34 (+0.46, +2.23)", "No", "B"],
    ["Guo 2003 [35]", "EAAT2 transgene", "SOD1-G93A × EAAT2", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
    ["Waibel 2004 [39]", "Riluzole", "SOD1-G93A", "+6.0", "+0.64 (−0.18, +1.46)", "Yes", "C"],
    ["Rothstein 2005 [3]", "Ceftriaxone", "SOD1-G93A", "+10.0", "+1.07 (+0.22, +1.93)", "No", "B"],
    ["Scott 2008 [30]", "Riluzole", "SOD1-G93A", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
    ["Li 2013 [31]", "Riluzole", "SOD1-G93A", "0", "0.00 (−0.58, +0.58)", "Yes", "A"],
    ["Jablonski 2014 [32]", "Riluzole", "SOD1-G93A", "0", "0.00 (−0.55, +0.55)", "Yes", "A"],
    ["Benkler 2016 [36]", "LV-EAAT2 (alone)", "SOD1-G93A", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
    ["Hogg 2018 [33]", "Riluzole", "SOD1-G93A", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
    ["Hogg 2018 [33]", "Riluzole", "TDP-43-A315T", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
    ["Hogg 2018 [33]", "Riluzole", "FUS(1-359)", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
    ["Chen 2020 [34]", "Riluzole", "TDP-43 tg rat", "0", "0.00 (−0.80, +0.80)", "Yes", "A"],
  ],
  [1700, 1450, 1650, 1050, 1910, 900, 700],
  { aligns: [undefined, undefined, undefined, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] },
));
doc.push(TNOTE("Δ survival, difference in mean survival versus concurrent control. Indep., independent of the laboratory that originated the finding for that agent and model. Tier, provenance tier of the extraction (see Methods 2.4). Group sizes were reported exactly for Li 2013 (23 vs 22) and Jablonski 2014 (25 vs 25) and imputed at 12 per group elsewhere."));

doc.push(TCAP(2, "Pooled effect of EAAT2 up-regulation on lifespan in rodent ALS models (k = 12)."));
doc.push(mkTable(
  ["Estimator", "g", "95% CI", "p", "τ²", "I²"],
  [
    ["REML + Knapp–Hartung", "+0.201", "−0.079 to +0.481", "0.142", "0.017", "22.1%"],
    ["DerSimonian–Laird", "+0.209", "−0.075 to +0.493", "0.134", "0.042", "22.1%"],
    ["Paule–Mandel", "+0.211", "−0.074 to +0.497", "0.132", "0.051", "22.1%"],
    ["Normalised mean difference", "+1.82%", "−0.41% to +4.05%", "0.099", "—", "—"],
  ],
  [2760, 1300, 2300, 1000, 1000, 1000],
  { aligns: [undefined, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] },
));
doc.push(TNOTE("95% prediction interval −0.20 to +0.61. Cochran's Q = 14.12, df = 11, p = 0.226. REML, restricted maximum likelihood."));

doc.push(TCAP(3, "Subgroup analysis by laboratory independence and by mechanistic route."));
doc.push(mkTable(
  ["Subgroup", "k", "g", "95% CI", "I²"],
  [
    ["Originating / non-independent laboratory", "2", "+1.202", "+0.587 to +1.818", "0%"],
    ["Independent replication", "10", "+0.051", "−0.180 to +0.283", "0%"],
    ["Pharmacological up-regulation", "10", "+0.256", "−0.037 to +0.549", "—"],
    ["Genetic or viral overexpression", "2", "0.000", "−0.566 to +0.566", "—"],
    ["Riluzole only", "9", "+0.169", "−0.100 to +0.439", "16%"],
  ],
  [3660, 700, 1200, 2500, 1300],
  { aligns: [undefined, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] },
));
doc.push(TNOTE("Between-subgroup Q for laboratory independence = 11.77, df = 1, p = 0.0006."));

doc.push(TCAP(4, "Test of excess significance in the Parkinson's disease efficacy stratum (k = 14, observed positives = 14)."));
doc.push(mkTable(
  ["Assumed true g", "Mean power", "Expected positives", "Observed", "χ²", "p"],
  [
    ["0.3", "8.8%", "1.23", "14", "144.8", "< 0.001"],
    ["0.5", "15.8%", "2.22", "14", "74.3", "< 0.001"],
    ["0.8", "33.1%", "4.63", "14", "28.4", "< 0.001"],
    ["1.0", "47.6%", "6.66", "14", "15.4", "< 0.001"],
    ["1.5", "80.9%", "11.33", "14", "3.30", "0.069"],
    ["2.0", "96.4%", "13.50", "14", "0.52", "0.471"],
  ],
  [1760, 1500, 2100, 1400, 1200, 1400],
  { aligns: Array(6).fill(AlignmentType.CENTER) },
));
doc.push(TNOTE("Power computed from the non-central t distribution at the observed sample sizes (median 8 per group, two-sided α = 0.05). A 14 of 14 success rate requires a true effect of g ≥ 2.73. Excluding the dominant research group (k = 9) gives χ² = 9.61, p = 0.002 at an assumed g = 1.0; collapsing to one observation per group (k = 8) gives χ² = 9.34, p = 0.002."));

doc.push(TCAP(5, "Predictive validity of the SOD1-G93A lifespan endpoint for the two agents with known clinical outcomes."));
doc.push(mkTable(
  ["Agent", "Mouse estimate (% survival change)", "Human outcome", "Verdict"],
  [
    ["Ceftriaxone (originating study)", "+7.8%", "Phase 3, n = 514: no survival benefit", "False positive"],
    ["Riluzole (originating study)", "+9.8%", "+2 to 3 months (~6\u201310% of survival)", "Directionally correct"],
    ["Riluzole (independent replications)", "+0.52% (95% CI \u22120.80 to +1.84)", "+2 to 3 months (~6\u201310% of survival)", "False negative"],
  ],
  [2560, 2700, 2600, 1500],
  { aligns: [undefined, AlignmentType.CENTER, undefined, AlignmentType.CENTER] },
));
doc.push(TNOTE("Human anchors: Cochrane-assessed survival gain of approximately two to three months, 9% absolute gain in one-year tracheostomy-free survival, median tracheostomy-free survival 11.8 to 14.8 months [40,41], and a 35% mortality reduction at 100 mg in the dose-ranging trial [42]."));

/* ---- Figure legends + figures ---- */
doc.push(BREAK(), H1("Figure legends"));
doc.push(FCAP(1, "Effect of EAAT2 up-regulation on lifespan in rodent models of ALS.",
  "Forest plot of 12 comparisons, stratified by laboratory independence. Squares are individual study estimates scaled by inverse variance; horizontal lines are 95% confidence intervals; diamonds are subgroup and overall random-effects summaries. Red denotes results reported by the authors as statistically significant, blue denotes null results. The rightmost column gives the provenance tier of each extraction. Between-subgroup Q = 11.77, df = 1, p = 0.0006."));
doc.push(FCAP(2, "Power, excess significance and the endpoint hierarchy.",
  "(a) Power of a two-sided two-sample t test as a function of true effect size at the sample sizes used in the Parkinson's disease stratum; a 14 of 14 success rate requires g ≥ 2.73 at n = 8 per group. (b) Observed versus expected number of positive studies under the Ioannidis–Trikalinos test across a range of assumed true effects; excess significance is rejected for all effects up to g = 1.0. (c) Proportion of assessments reporting benefit by outcome domain across both strata, with counts shown; the target-engagement row is shown for completeness but excluded from the trend claim."));
doc.push(FCAP(3, "Sensitivity, confounding and predictive validity.",
  "(a) Distribution of the pooled estimate across 10,000 simulations in which each null study's point estimate was redrawn from its sampling distribution rather than fixed at zero; the between-subgroup test remained significant in 100% of simulations. (b) Effect size against publication year, coloured by laboratory independence, showing the collinearity of the two variables (r = +0.64, p = 0.024); marker area is proportional to inverse variance. (c) Mouse and human estimates for the two agents with known clinical outcomes, expressed as percentage change in survival; error bars are 95% confidence intervals where available and the human riluzole bar spans the conservative and direct scalings."));

doc.push(BREAK());
doc.push(figure("fig1_forest_als.png", 0.7507, 600));
doc.push(P("Figure 1", { align: AlignmentType.CENTER, size: 22 }));
doc.push(BREAK());
doc.push(figure("fig3_pd_bias_dissociation.png", 0.3103, 640));
doc.push(P("Figure 2", { align: AlignmentType.CENTER, size: 22 }));
doc.push(BREAK());
doc.push(figure("fig4_revision_sensitivity.png", 0.3054, 640));
doc.push(P("Figure 3", { align: AlignmentType.CENTER, size: 22 }));

/* ================================================================ SUPPLEMENTARY */
supp.push(new Paragraph({
  children: runs("Supplementary material", { font: FONT, size: 28, bold: true }),
  alignment: AlignmentType.CENTER, spacing: { after: 200, line: 360 },
}));
supp.push(new Paragraph({
  children: runs("EAAT2 up-regulation preserves neurons without extending lifespan, and the murine survival endpoint is discordant with clinical outcome: a systematic review and meta-analysis in ALS and Parkinson's disease",
                 { font: FONT, size: 22, italics: true }),
  alignment: AlignmentType.CENTER, spacing: { after: 160, line: 320 },
}));
supp.push(P("Alper Karag\u00f6l, Taner Karag\u00f6l", { align: AlignmentType.CENTER, line: 320, after: 320, size: 22 }));
supp.push(P("**Contents.** Supplementary Tables S1 to S5 and Supplementary Figure S1. Study-level data, analysis code and full console output are provided as separate machine-readable files.", { line: 360, after: 240 }));
supp.push(BREAK());

supp.push(H1("Supplementary tables"));
supp.push(TCAP("S1", "Characteristics of the included reports in the Parkinson's disease stratum (14 efficacy, 1 reclassified as a safety observation)."));
supp.push(mkTable(
  ["Study", "Model", "Species", "Primary dopaminergic outcome", "Direction", "Group"],
  [
    ["Leung 2012 [7]", "6-OHDA", "Rat", "Dopaminergic cell death, TH protein", "Protective", "Yung"],
    ["Chotibut 2014 [8]", "6-OHDA", "Rat", "Striatal TH loss", "Protective", "Salvatore"],
    ["Bisht 2014 [9]", "MPTP", "Rat", "Nigral oxidative damage, motor", "Protective", "Prakash"],
    ["Ho 2014 [10]", "MPTP", "Rat", "Neuronal and behavioural change", "Protective", "Ho"],
    ["Kelsey 2014 [11]", "6-OHDA", "Rat", "Forepaw stepping, dyskinesia", "Protective", "Kelsey"],
    ["Hsu 2015 [12]", "MPTP", "Rat", "Neuronal deficits (PDD)", "Protective", "Ho"],
    ["Huang 2015 [13]", "MPTP", "Rat", "Neuronal and behavioural deficits", "Protective", "Ho"],
    ["Weng 2016 [14]", "PD model", "Rat", "Neurodegeneration, neurogenesis", "Protective", "Ho"],
    ["Chotibut 2017 [15]", "6-OHDA", "Rat", "L-DOPA-induced dyskinesia", "Protective", "Salvatore"],
    ["Kaur 2017 [16]", "MPTP", "Rat", "Neuroinflammation, BDNF, motor", "Protective", "Prakash"],
    ["Hsieh 2017 [17]", "MPTP", "Rat", "Behaviour, neurogenesis", "Protective", "Ho"],
    ["Zhou 2021 [18]", "MPTP", "Mouse", "Dopaminergic loss, inflammation", "Protective", "Zhou"],
    ["Ren 2022 [19]", "GLT-1 knockdown", "Rat", "TH-positive neuron loss", "Protective", "Ren"],
    ["Avagliano 2022 [21]", "6-OHDA dual-hit, oral CEF 8 g/kg", "Mouse", "Striatal TH (western blot); rotations", "Harmful*", "Mattace Raso"],
    ["Zhi 2025 [20]", "PD model", "Mouse", "Dopaminergic neurons, ferroptosis", "Protective", "Guo"],
  ],
  [1500, 1500, 900, 2900, 1260, 1300],
  { size: 18, aligns: [undefined, undefined, AlignmentType.CENTER, undefined, AlignmentType.CENTER, undefined] },
));
supp.push(TNOTE("All studies used ceftriaxone. Group, research group of origin; eight groups produced the fourteen efficacy reports, with the largest contributing five. Median group size was 8 animals. *Reclassified out of the efficacy stratum: ceftriaxone was given orally at 8 g/kg before the lesion in order to induce gut dysbiosis, not as a candidate neuroprotectant, and is analysed as a safety observation. The method of dopaminergic quantification, and in particular whether unbiased stereology was used, was not determinable from retrieved records for most studies. TH, tyrosine hydroxylase; PDD, Parkinson's disease dementia."));

supp.push(TCAP("S2", "Sensitivity of the pooled estimate to the assumed survival standard deviation and imputed group size."));
supp.push(mkTable(
  ["Assumed SD", "n imputed = 8", "n imputed = 12", "n imputed = 20"],
  [
    ["6 days", "+0.271 (−0.13, +0.67)", "+0.331 (−0.10, +0.77)", "+0.364 (−0.09, +0.82)"],
    ["9 days (base case)", "+0.167 (−0.09, +0.42)", "+0.201 (−0.08, +0.48)", "+0.241 (−0.06, +0.54)"],
    ["12 days", "+0.132 (−0.07, +0.33)", "+0.153 (−0.06, +0.37)", "+0.179 (−0.05, +0.41)"],
    ["14 days", "+0.115 (−0.06, +0.29)", "+0.134 (−0.05, +0.32)", "+0.153 (−0.04, +0.35)"],
  ],
  [2160, 2400, 2400, 2400],
  { aligns: [undefined, AlignmentType.CENTER, AlignmentType.CENTER, AlignmentType.CENTER] },
));
supp.push(TNOTE("Values are pooled Hedges' g (95% CI) under REML with the Knapp–Hartung adjustment. The pooled estimate was non-significant in all twelve combinations (p range 0.107 to 0.180)."));

supp.push(TCAP("S3", "Proportion of assessments reporting benefit, by outcome domain, across both strata."));
supp.push(mkTable(
  ["Outcome domain", "Positive / assessed", "Rate"],
  [
    ["Molecular target engagement (GLT-1/EAAT2 expression, glutamate uptake)*", "17 / 17", "100%"],
    ["Histological neuroprotection (tyrosine hydroxylase or motor neuron counts)", "16 / 17", "94%"],
    ["Short-term motor and strength endpoints", "13 / 20", "65%"],
    ["Disease onset (ALS models only)", "1 / 8", "13%"],
    ["Lifespan or survival duration", "2 / 12", "17%"],
  ],
  [5760, 2200, 1400],
  { aligns: [undefined, AlignmentType.CENTER, AlignmentType.CENTER] },
));
supp.push(TNOTE("*Excluded from the trend claim as non-informative: a report that a GLT-1 inducer failed to induce GLT-1 would be unlikely to be published or to enter this corpus, so this row reflects publication practice rather than biology. Study-level attribution for each domain is given in the supplementary file outcome_domains.csv."));

supp.push(TCAP("S4", "Monte-Carlo sensitivity to the coding of null results (10,000 simulations)."));
supp.push(mkTable(
  ["Quantity", "Deterministic coding (\u03b4 = 0)", "Redrawn from sampling distribution"],
  [
    ["Pooled g", "+0.201", "median +0.223 (+0.071 to +0.369)"],
    ["Pooled effect significant", "no (p = 0.142)", "significant in 13.1% of simulations"],
    ["I\u00b2", "22.1%", "median 44.0%"],
    ["Originating subgroup g", "+1.202", "median +1.202"],
    ["Independent subgroup g", "+0.051", "median +0.053 (\u22120.132 to +0.238)"],
    ["Between-subgroup p", "0.0006", "median 0.0006; < 0.05 in 100% of simulations"],
  ],
  [2600, 2900, 3860],
  { aligns: [undefined, AlignmentType.CENTER, AlignmentType.CENTER] },
));
supp.push(TNOTE("Each study reported as non-significant had its point estimate redrawn from N(0, SE\u00b2) truncated at \u00b11.96 SE, the range consistent with a reported non-significant result, and the full model refitted. Parenthetical ranges are 2.5th to 97.5th centiles."));

supp.push(TCAP("S5", "Robustness of the riluzole exclusion to the choice of human effect scaling, and the bound on what two agents can support."));
supp.push(mkTable(
  ["Human benefit, scaled as % of survival", "Distance above the pooled murine estimate", "Excluded at 95%?"],
  [
    ["0.7 months on 36 months (1.94%) \u2014 deliberately sceptical", "2.6 SE", "Yes"],
    ["2 months on 36 months (5.56%) \u2014 most conservative", "9.0 SE", "Yes"],
    ["2 months on 30 months (6.67%)", "11.0 SE", "Yes"],
    ["3 months on 30 months (10.0%) \u2014 Cochrane upper", "17.0 SE", "Yes"],
    ["Median tracheostomy-free survival (+25.4%)", "44.6 SE", "Yes"],
    ["Threshold: largest human benefit compatible with the murine interval", "\u2014", "\u2248 1.8% of survival, about 3 weeks"],
  ],
  [4400, 3160, 1800],
  { aligns: [undefined, AlignmentType.CENTER, AlignmentType.CENTER] },
));
supp.push(TNOTE("Distances are expressed in pooled standard errors of the independent-replication estimate (+0.52%, SE 0.56%, k = 8). Individual replications were less well powered: at n = 12 per group, power to detect the 5.56% scaling was 46%, rising to 91% at the 10% scaling. The exclusion is therefore a property of the pooled literature rather than of any single experiment. Concordance across the two agents with known clinical outcomes was 0 of 2, for which the exact 95% confidence interval is 0% to 84%; no discordance rate is estimable from two agents."));


supp.push(BREAK(), H1("Supplementary figure"));
supp.push(FCAP("S1", "Cumulative meta-analysis and funnel plot.",
  "Left, cumulative random-effects estimate in order of publication, showing an 84% decline from g = +1.34 (1996) to g = +0.21 (2020), with the confidence interval including zero continuously since 2013. Right, funnel plot with pseudo-95% confidence contours around the pooled estimate. Egger intercept +3.42, p = 0.115; both bias tests are underpowered at k = 12."));
supp.push(BREAK());
supp.push(figure("fig2_cumulative_funnel.png", 0.4092, 620));
supp.push(P("Supplementary Figure S1", { align: AlignmentType.CENTER, size: 22 }));

/* ================================================================ ASSEMBLE */
const document = new Document({
  creator: "EAAT2 preclinical meta-analysis",
  title: "EAAT2 up-regulation preserves neurons but not lifespan",
  styles: {
    default: {
      document: { run: { font: FONT, size: 24, color: "000000" } },
      heading1: { run: { font: FONT, size: 26, bold: true, color: "000000" },
                  paragraph: { spacing: { before: 360, after: 160, line: 480 } } },
      heading2: { run: { font: FONT, size: 24, bold: true, color: "000000" },
                  paragraph: { spacing: { before: 280, after: 120, line: 480 } } },
      heading3: { run: { font: FONT, size: 24, bold: false, italics: true, color: "000000" },
                  paragraph: { spacing: { before: 240, after: 100, line: 480 } } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
      lineNumbers: { countBy: 1, start: 1, restart: LineNumberRestartFormat.CONTINUOUS, distance: 360 },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 })],
        })],
      }),
    },
    children: doc,
  }],
});

const suppDoc = new Document({
  creator: "EAAT2 preclinical meta-analysis",
  title: "Supplementary material",
  styles: {
    default: {
      document: { run: { font: FONT, size: 24, color: "000000" } },
      heading1: { run: { font: FONT, size: 26, bold: true, color: "000000" },
                  paragraph: { spacing: { before: 360, after: 160, line: 480 } } },
    },
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ children: ["S", PageNumber.CURRENT], font: FONT, size: 20 })],
        })],
      }),
    },
    children: supp,
  }],
});

Promise.all([Packer.toBuffer(document), Packer.toBuffer(suppDoc)]).then(([a, b]) => {
  fs.writeFileSync(path.join(ROOT, "out", "EAAT2_manuscript.docx"), a);
  fs.writeFileSync(path.join(ROOT, "out", "EAAT2_supplementary.docx"), b);
  console.log("main:", a.length, "bytes | supplementary:", b.length, "bytes");
});
