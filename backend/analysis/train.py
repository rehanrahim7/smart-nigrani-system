"""Reproducible, offline Isolation Forest baseline; no fraud labels or accuracy claim."""
import json, math
from pathlib import Path
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import RobustScaler
from sklearn.impute import SimpleImputer

p=Path('data/analyzed.json')
data=json.loads(p.read_text())
works=[w for w in data['works'] if w['sanctionAmount'] and w['age'] is not None]
names=['log_sanction_amount','payment_to_sanction_ratio','log_payment_count','sanction_interval_days','sanction_age_days']
X=np.array([[math.log1p(w['sanctionAmount']),w['paid']/w['sanctionAmount'],math.log1p(len(w['payments'])),w['sanctionInterval'] if w['sanctionInterval'] is not None else np.nan,w['age']] for w in works])
imputer=SimpleImputer(strategy='median'); scaler=RobustScaler()
Z=scaler.fit_transform(imputer.fit_transform(X))
model=IsolationForest(n_estimators=160,random_state=42,contamination='auto',n_jobs=1)
model.fit(Z)
scores=-model.score_samples(Z)
for w,s in zip(works,scores):
 w['ml']={'percentile':round(float((scores<=s).sum()/len(scores)*100),1),'score':round(float(s),5)}
data['summary']['ml']={'model':'Isolation Forest','version':'iforest-1.0','seed':42,'trainingRecords':len(works),'features':names,'scope':'Exploratory ranking on this snapshot; not a prediction of fraud or future delay. Not included in rule priority.','evaluation':'No reviewed labels. Generalisation and precision are not yet established.'}
p.write_text(json.dumps(data,separators=(',',':')))
Path('analysis/model-card.json').write_text(json.dumps(data['summary']['ml'],indent=2))
# Plain JSON model enables identical inference in the hosted JavaScript runtime.
trees=[]
for estimator in model.estimators_:
 t=estimator.tree_
 trees.append({'left':t.children_left.tolist(),'right':t.children_right.tolist(),'feature':t.feature.tolist(),'threshold':t.threshold.tolist(),'samples':t.n_node_samples.tolist()})
Path('data/model.json').write_text(json.dumps({'medians':imputer.statistics_.tolist(),'center':scaler.center_.tolist(),'scale':scaler.scale_.tolist(),'maxSamples':int(model.max_samples_),'trees':trees,'baselineScores':sorted(scores.tolist())},separators=(',',':')))
print(json.dumps(data['summary']['ml'],indent=2))
