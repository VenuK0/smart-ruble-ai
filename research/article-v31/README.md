# SmartRubleAI article evidence v3.1

Frozen synthetic research package for the v3.2 editorial revision. The experiments and numerical results have not changed.

Download [the reproducible package](SmartRubleAI_article_v3_1_package.zip).

SHA-256: `bf595fcdc9a59cae54d4ee14f262a5cd4f7d8739494a8f577b95e48db1c890ba`

The ZIP contains the source snapshot, pinned dependencies, synthetic catalogs, product-family splits, 21,740 prediction rows, 400 policy-result rows, detailed metrics, and five research tests. A full run from an extracted ZIP without Git reproduced the decisions and counts on the authors' Honor laptop; this is not an external laboratory replication. See outputs/article-evidence-v31/VERIFICATION.json and TECHNICAL_APPENDIX.md inside the ZIP.

The regional validation-selected current model made 440 automatic decisions out of 2,880 test presentations (15.28%); 151 automatic decisions were wrong (34.32%), including 33 ineligible approvals, 9 category errors and 109 false rejections. Of 33 ineligible approvals, 24 occurred in one split. Repeated synthetic presentations are dependent and do not establish deployment risk.

No real payments or digital-ruble infrastructure are involved. The production v0.5.0 classifier is unchanged. The v3.2 article authors are V. I. Okunev and A. R. Shtun; I. G. Rzun is the research supervisor. Earlier document metadata is retained in this frozen evidence archive for provenance.

## Reproduce

Extract the ZIP, open repository/, create a Python 3.14 virtual environment, install requirements-article-lock.txt and run scripts/article_study.py then scripts/article_package.py. Research outputs are saved to the sibling outputs/article-evidence-v31/ directory. Git is not required; SOURCE_VERSION.json identifies the base code snapshot.
