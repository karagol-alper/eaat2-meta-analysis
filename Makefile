PY   ?= python3
NODE ?= node

.PHONY: all analysis figures manuscript clean dirs

all: manuscript

dirs:
	@mkdir -p out figs

analysis: dirs
	$(PY) src/run_analysis.py      | tee out/analysis_log.txt
	$(PY) src/revision_analyses.py | tee out/revision_log.txt

figures: analysis
	$(PY) src/make_figures.py
	$(PY) src/make_figure4.py

manuscript: figures
	$(NODE) src/build_manuscript.js

clean:
	rm -rf out figs __pycache__ src/__pycache__
