#!/usr/bin/env python3
"""Plan bounded extra OSM tiles around the user's exact City-matched corridors.
Exclude the 64 already cached full-Zone-1 tiles. Retain a ~300m route buffer.
"""
import json
import math
from pathlib import Path
import re

def canonical(name):
    substitutions = {'avenue':'ave','boulevard':'blvd','road':'rd','street':'st','drive':'dr','parkway':'pkwy','court':'ct','east':'e','west':'w','south':'s','north':'n'}
    return ' '.join(substitutions.get(word,word) for word in re.sub('[^a-z0-9 ]','',name.lower()).split())

entries=json.loads(Path('data-sources/study-entries.json').read_text())['entries']
names={canonical(name) for entry in entries for name in entry['names']}
city=json.loads(Path('data-sources/city-streets-full.geojson').read_text())
origin=[-122.013,37.516]
step=[0.013125,0.012]
cells=set()
matched=set()
for feature in city['features']:
    name=feature['properties'].get('ST_NAME','') or ''
    if canonical(name) not in names:
        continue
    matched.add(name)
    geometry=feature['geometry']
    lines=[geometry['coordinates']] if geometry['type']=='LineString' else geometry['coordinates']
    for line in lines:
        west=min(p[0] for p in line)-0.0035; east=max(p[0] for p in line)+0.0035
        south=min(p[1] for p in line)-0.003; north=max(p[1] for p in line)+0.003
        for y in range(math.floor((south-origin[1])/step[1]),math.floor((north-origin[1])/step[1])+1):
            for x in range(math.floor((west-origin[0])/step[0]),math.floor((east-origin[0])/step[0])+1):
                if not(0<=x<8 and 0<=y<8):
                    cells.add((y,x))
tiles=[{'y':y,'x':x,'bbox':[round(origin[0]+x*step[0],7),round(origin[1]+y*step[1],7),round(origin[0]+(x+1)*step[0],7),round(origin[1]+(y+1)*step[1],7)]} for y,x in sorted(cells)]
bbox=[min(t['bbox'][0] for t in tiles),min(t['bbox'][1] for t in tiles),max(t['bbox'][2] for t in tiles),max(t['bbox'][3] for t in tiles)]
plan={'bbox':bbox,'tiles':tiles,'matchedCityNames':sorted(matched),'coverage':'Selected bounded OSM API tiles along the exact 38-entry City-matched corridors, with approximately 300m buffer. Not complete bounding-box or city coverage. Full Zone 1 tiles are preserved in the earlier import.'}
Path('/tmp/fremont-study-tiles.json').write_text(json.dumps(plan,indent=2)+'\n')
print(json.dumps({'tiles':len(tiles),'bbox':bbox,'cityNames':sorted(matched)}))
