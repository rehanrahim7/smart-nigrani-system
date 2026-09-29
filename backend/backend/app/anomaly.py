"""
The Isolation Forest, running inside the backend.

What this is
------------
The team trained an Isolation Forest on 2,437 sanctioned works using
scikit-learn (see analysis/train.py). It is an UNSUPERVISED model: nobody ever
told it which works were bad. It learns what an ordinary work looks like across
five numbers, and then reports how far from ordinary each work sits.

Why it is here rather than in the website
-----------------------------------------
The training script exported the forest as plain JSON (data/model.json) so it
could be scored from JavaScript, and that scoring code lived in the frontend.
That is why the backend looked as if it had no model. The maths is now here
instead, where the rest of the analysis lives, and the website simply reads the
result.

Why there is no scikit-learn in requirements.txt
------------------------------------------------
Scoring a trained forest is only walking a few hundred small decision trees.
That needs no libraries at all, so this file is written with the standard
library alone. Installing scikit-learn, numpy and scipy to do arithmetic that
fits on one screen would add about 100 MB and a long install to every laptop
that runs this project. Training still needs them, and analysis/train.py still
imports them, but training is something you do once, offline.

How a score is produced
-----------------------
A tree splits the data at random. A point that is unlike the rest gets isolated
after only a few splits, so it ends up in a SHALLOW leaf. An ordinary point
takes many splits to separate, so it ends up DEEP. Average the depth over every
tree, compare it with the depth you would expect by chance, and you have a
number between 0 and 1 where higher means stranger.

This score is deliberately NOT part of the review priority shown on screen.
That number comes from the four rule-based checks, and it can be explained line
by line. This is a second opinion from a different kind of method, and it is
labelled that way everywhere it appears.
"""

from __future__ import annotations

import json
import math
import struct
from bisect import bisect_right
from pathlib import Path
from typing import Sequence

from .config import DATA_DIR

MODEL_FILE = DATA_DIR / "model.json"

# Euler-Mascheroni constant, used by the expected-path-length correction below.
EULER_GAMMA = 0.5772156649015329


def _fround(value: float) -> float:
    """
    Round to the nearest 32-bit float.

    The JavaScript version of this scoring used Math.fround, which silently
    rounds to single precision. Matching that here means both produce exactly
    the same score rather than two numbers that differ in the sixth decimal
    place and raise questions nobody can answer.
    """
    return struct.unpack("f", struct.pack("f", value))[0]


def _expected_depth(n: int) -> float:
    """
    The average depth at which a tree separates one point out of n, if the
    splits were purely random. Used to turn a raw depth into a score that does
    not depend on how much data the tree happened to hold.
    """
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2 * (math.log(n - 1) + EULER_GAMMA) - 2 * (n - 1) / n


class IsolationForest:
    """A trained forest, loaded from JSON and used only for scoring."""

    def __init__(self, payload: dict) -> None:
        self.medians: list[float] = payload["medians"]
        self.center: list[float] = payload["center"]
        self.scale: list[float] = payload["scale"]
        self.max_samples: int = payload["maxSamples"]
        self.trees: list[dict] = payload["trees"]
        # Every score seen during training, sorted. Used to say where a new
        # work sits relative to the works the model was trained on.
        self.baseline: list[float] = payload["baselineScores"]
        self._normaliser = len(self.trees) * _expected_depth(self.max_samples)

    def score(self, features: Sequence[float | None]) -> dict:
        """
        Score one work.

        `features` must be, in this order:
          0  log(1 + approved amount)
          1  amount paid / amount approved
          2  log(1 + number of payments)
          3  days between recommendation and sanction
          4  days since sanction

        Any of them may be None. A missing value is replaced with the median of
        that feature from training, which is what the training pipeline did.
        """
        # Fill gaps, then centre and scale exactly as training did.
        x = [
            _fround(
                ((features[i] if features[i] is not None else self.medians[i]) - self.center[i])
                / self.scale[i]
            )
            for i in range(len(self.medians))
        ]

        total_depth = 0.0
        for tree in self.trees:
            left = tree["left"]
            right = tree["right"]
            feature = tree["feature"]
            threshold = tree["threshold"]

            node = 0
            depth = 0
            while left[node] != -1:
                node = left[node] if x[feature[node]] <= threshold[node] else right[node]
                depth += 1
            # Leaves can still hold several points. Add the depth those points
            # would have needed, so a leaf of 20 is not treated like a leaf of 1.
            total_depth += depth + _expected_depth(tree["samples"][node])

        score = 2 ** (-total_depth / self._normaliser)

        # Where this sits among the training scores. 90 means stranger than
        # 90% of the works the model learned from.
        rank = bisect_right(self.baseline, score + 1e-12)
        percentile = rank / len(self.baseline) * 100

        return {
            "score": round(score, 5),
            "percentile": round(percentile, 1),
        }


_forest: IsolationForest | None = None


def forest() -> IsolationForest | None:
    """
    Load the model once, and keep working if it is missing.

    The model file is an optional extra: the four rule checks are what produce
    the review priority. If somebody deletes data/model.json the rest of the
    system carries on, and the anomaly figures simply do not appear.
    """
    global _forest
    if _forest is None:
        if not MODEL_FILE.exists():
            return None
        with MODEL_FILE.open(encoding="utf-8") as fh:
            _forest = IsolationForest(json.load(fh))
    return _forest


def features_for(project: dict) -> list[float | None] | None:
    """
    Build the five numbers from one of our project records.

    Returns None when the work cannot be scored. The model was trained only on
    sanctioned works with a known amount and a known age, so scoring a
    recommendation that was never approved would be inventing a result.
    """
    budget = project.get("budget")
    age = project.get("daysSinceSanction")

    if not budget or budget <= 0 or age is None:
        return None

    paid = project.get("totalPaid") or 0
    payments = project.get("paymentCount") or 0

    # Days between the recommendation and the sanction.
    interval: float | None = None
    recommended = project.get("recommendedDate")
    sanctioned = project.get("sanctionDate")
    if recommended and sanctioned:
        from datetime import date

        try:
            interval = (date.fromisoformat(sanctioned) - date.fromisoformat(recommended)).days
        except ValueError:
            interval = None

    return [
        math.log1p(budget),
        paid / budget,
        math.log1p(payments),
        interval,
        float(age),
    ]


def score_project(project: dict) -> dict | None:
    """Score one project record, or return None if it cannot be scored."""
    model = forest()
    if model is None:
        return None

    features = features_for(project)
    if features is None:
        return None

    return model.score(features)
