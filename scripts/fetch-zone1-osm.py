#!/usr/bin/env python3
"""Cache a bounded OSM API map extract covering the full historical Zone 1 bbox.

No geometry is generated. Whole OSM ways and their source node IDs are retained.
Run with a cache/output directory, then normalize with the existing importer.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import xml.etree.ElementTree as ET

cache = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/fremont-zone1-osm')
cache.mkdir(parents=True, exist_ok=True)
bbox = [-122.013, 37.516, -121.908, 37.612]
elements = {}
manifest = []
conflicts = []
grid = 8  # Dense central-city tiles must stay below the API's 50,000-node cap.
if len(sys.argv) > 2:
    plan = json.loads(Path(sys.argv[2]).read_text())
    bbox = plan['bbox']
    specs = [(tile['y'], tile['x'], tile['bbox']) for tile in plan['tiles']]
else:
    specs = [(y, x, [round(bbox[0] + (bbox[2]-bbox[0])*x/grid, 7), round(bbox[1] + (bbox[3]-bbox[1])*y/grid, 7), round(bbox[0] + (bbox[2]-bbox[0])*(x+1)/grid, 7), round(bbox[1] + (bbox[3]-bbox[1])*(y+1)/grid, 7)]) for y in range(grid) for x in range(grid)]
for y, x, tile in specs:
    url = 'https://api.openstreetmap.org/api/0.6/map?bbox=' + ','.join(map(str, tile))
    filename = cache / f'tile-{grid}-{y}-{x}.osm'
    if not filename.exists():
        temporary = filename.with_suffix('.partial')
        subprocess.run(['curl', '-fsSL', '--max-time', '55', '--retry', '2', '--user-agent', 'FremontStreets/0.1 bounded educational road import', url, '-o', str(temporary)], check=True)
        ET.parse(temporary)
        temporary.rename(filename)
    raw = filename.read_bytes()
    root = ET.fromstring(raw)
    timestamp = root.find('meta').attrib.get('osm_base') if root.find('meta') is not None else None
    manifest.append({'url': url, 'bbox': tile, 'sha256': hashlib.sha256(raw).hexdigest(), 'bytes': len(raw), 'dataTimestamp': timestamp})
    for item in root:
        if item.tag not in ('node', 'way', 'relation'):
            continue
        value = {'type': item.tag, 'id': int(item.attrib['id']), 'version': int(item.attrib.get('version', '0')), 'timestamp': item.attrib.get('timestamp'), 'tags': {t.attrib['k']: t.attrib['v'] for t in item.findall('tag')}}
        if item.tag == 'node':
            value.update(lon=float(item.attrib['lon']), lat=float(item.attrib['lat']))
        if item.tag == 'way':
            value['nodes'] = [int(n.attrib['ref']) for n in item.findall('nd')]
        if item.tag == 'relation':
            value['members'] = [{'type': m.attrib['type'], 'ref': int(m.attrib['ref']), 'role': m.attrib.get('role', '')} for m in item.findall('member')]
        key = (item.tag, value['id'])
        if key in elements and elements[key] != value:
            conflicts.append({'type': item.tag, 'id': value['id']})
            raise RuntimeError(f'Source object changed between tile downloads: {key}; refresh affected cached tiles explicitly.')
        elements[key] = value
    print(json.dumps({'tile': [y, x], 'elementsSoFar': len(elements), 'bytes': len(raw)}), flush=True)
# Map API can include relation references to ways outside the extract. Existing
# normalization retains rules relevant to the included approach; it never adds
# the absent roads or guesses their geometry.
times = [m['dataTimestamp'] for m in manifest if m['dataTimestamp']]
output = {'osm3s': {'timestamp_osm_base': min(times) if times else None}, 'elements': list(elements.values())}
(cache/'extract.json').write_text(json.dumps(output, separators=(',', ':')))
(cache/'manifest.json').write_text(json.dumps({'bbox': bbox, 'tiles': manifest, 'conflicts': conflicts, 'coverage': plan['coverage'] if len(sys.argv)>2 else 'Complete buffered Zone 1 bounding-box retrieval; OSM correctness and current traffic rules remain independently unverified.'}, indent=2)+'\n')
print(json.dumps({'output': str(cache/'extract.json'), 'manifest': str(cache/'manifest.json'), 'elements': len(elements)}))
