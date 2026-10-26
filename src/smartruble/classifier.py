"""Семантический классификатор позиций чека: TF-IDF по символьным n-граммам + логистическая регрессия."""
from __future__ import annotations
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline


class ItemClassifier:
    def __init__(self):
        self.model = make_pipeline(
            TfidfVectorizer(analyzer="char_wb", ngram_range=(2, 5), lowercase=True, sublinear_tf=True),
            LogisticRegression(max_iter=1000, C=8.0),
        )

    def fit(self, names, labels):
        self.model.fit(list(names), list(labels))
        return self

    def predict_one(self, name: str):
        """Возвращает (категория, уверенность)."""
        proba = self.model.predict_proba([name])[0]
        i = int(proba.argmax())
        return self.model.classes_[i], float(proba[i])

    def predict_many(self, names):
        proba = self.model.predict_proba(list(names))
        idx = proba.argmax(axis=1)
        return [(self.model.classes_[i], float(p[i])) for i, p in zip(idx, proba)]
