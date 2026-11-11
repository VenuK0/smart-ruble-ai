# SmartRubleAI v0.5 — preliminary text-classifier comparison

**Status:** reproducible research on **synthetic** product names only, 11 November 2026.
This does not certify a payment product or replace the values in the already-submitted presentation.

## Goal

Check whether simple changes to the TF-IDF representation improve generalization
to product base names entirely excluded from training, **without increasing
automatic approvals of ineligible ("other") purchases**.

## Method

- Same dataset generator: `smartruble.data.make_items`, 160 generated examples
  per class, five classes.
- Same `split_by_base` procedure for each model and seed (0, 1, 2):
  an underlying product name never appears in both train and test.
- 670 held-out synthetic positions in total across the three runs.
- All models use logistic regression. Vary text features only: current
  `char_wb(2,5)`, `char_wb(2,6)`, and `char_wb(2,5) + word(1,2)`.
- Simulated automatic approval threshold = 0.8 and rejection threshold = 0.6.
  For this comparison all four valid categories are assumed to be in the estimate;
  real decisions also require available budget.
- Metrics are averaged across seeds (unweighted mean of each per-run metric).
  **False approvals** divide the number of ineligible items wrongly approved
  by the total number of ineligible items in that run.
  These are NOT probabilistic risk scores.

## Observed values

| Representation | Accuracy on unseen product bases | Ineligible auto-approved | All auto-decisions |
| --- | ---: | ---: | ---: |
| **Current TF-IDF, char 2–5** | **52.81%** | **0.69%** | **13.98%** |
| Char 2–6 | 51.76% | 2.08% | 13.09% |
| Char 2–5 + word 1–2 | 49.21% | 6.21% | 14.00% |

The largest per-run false-approval rate for the current model was 2.08%;
for the two alternatives it was 6.25% and 12.50%, respectively.

**Decision:** retain the current production classifier unchanged. Neither
candidate showed a defensible safety improvement on this exploratory split.
The original submission's 45%/3.4%/18% figures used a different test setup;
do not compare them as pre/post measurements.

## Limitations and next experiment

- Artificial names and categories, tiny vocabulary, no labelled real checks.
- Three seeds cannot support a reliable estimate of deployment risk.
- Confidence scores of different fitted models are not calibrated to a shared meaning.
- No word embeddings/LLM were tested: hybrid character/word TF-IDF is **not**
  a semantic embedding system.
- Before any model switch, use a larger independently labelled set, separate
  tuning/validation/test partitions and explicit false-approval safety limits.
- If no genuine safe improvement is measured, route uncertain items to the
  human review queue instead of falsely claiming high model confidence.

## Reproduce

```bash
PYTHONPATH=src python -m smartruble.model_benchmark --seeds 0 1 2 --samples-per-class 160
```

Verified GitHub Actions run: https://github.com/VenuK0/smart-ruble-ai/actions/runs/43068222407

This experiment does not involve the digital-ruble infrastructure or actual financial operations.
