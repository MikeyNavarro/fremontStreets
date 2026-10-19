#!/usr/bin/env python3
"""Retrieve every paginated City arterial/parkway/major/collector feature.
Use official classification attributes; do not use this geometry for routing.
"""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.parse

endpoint = 'https://services2.arcgis.com/AVso4yDITKsybTJg/arcgis/rest/services/Streets/FeatureServer/0'
features = []
pages = []
offset = 0
while True:
    query = {'where': '1=1' if '--all' in sys.argv else "ST_CLASS IN ('ART','COL','PWY','MAJ')", 'geometry': '-122.17,37.43,-121.85,37.63' if '--all' in sys.argv else '-122.013,37.516,-121.908,37.612', 'geometryType': 'esriGeometryEnvelope', 'inSR': '4326', 'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'outSR': '4326', 'returnGeometry': 'true', 'f': 'geojson', 'orderByFields': 'OBJECTID', 'resultRecordCount': '1000', 'resultOffset': str(offset)}
    url = endpoint + '/query?' + urllib.parse.urlencode(query)
    raw = subprocess.check_output(['curl', '-fsSL', '--max-time', '40', url])
    data = json.loads(raw)
    if 'error' in data:
        raise RuntimeError(data['error'])
    items = data.get('features', [])
    features.extend(items)
    pages.append({'url': url, 'sha256': hashlib.sha256(raw).hexdigest(), 'count': len(items)})
    if not data.get('properties', {}).get('exceededTransferLimit'):
        break
    if not items:
        raise RuntimeError('Pagination did not advance')
    offset += len(items)
metadata_raw = subprocess.check_output(['curl', '-fsSL', '--max-time', '30', endpoint+'?f=json'])
metadata = json.loads(metadata_raw)
result = {'type': 'FeatureCollection', 'features': features, 'metadata': {'sourceUrl': endpoint, 'catalogItem': 'https://www.arcgis.com/home/item.html?id=bdb90b3d924d45a8b8ff2f87dd83c332', 'owner': 'OpenData_cofgis', 'credit': 'City of Fremont GIS Division', 'retrievedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'editingInfo': metadata.get('editingInfo'), 'classDomain': next(f['domain'] for f in metadata['fields'] if f['name']=='ST_CLASS'), 'pages': pages, 'routingUse': 'Official classification and inventory cross-check only; OSM source node identity remains routing authority.', 'license': 'No explicit reuse license supplied by catalog metadata; preserve City attribution.'}}
Path('data-sources').mkdir(exist_ok=True)
output = 'data-sources/city-streets-full.geojson' if '--all' in sys.argv else 'data-sources/city-streets.geojson'
Path(output).write_text(json.dumps(result, separators=(',', ':'))+'\n')
print(json.dumps({'features': len(features), 'pages': len(pages), 'output': output}))
