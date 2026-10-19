"""Render human-readable snapshots from the machine-readable study audit."""
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
network = json.loads((root / 'public/data/study-network.json').read_text())
entries = network['entries']
lookup = {entry['id']: entry['originalLabel'] for entry in entries}
matrix = json.loads((root / 'docs/data/study-connectivity.json').read_text())['matrix']
cells = {(cell['from'], cell['to']): cell for cell in matrix}
lines = [
    '# Directed representative connectivity matrix', '',
    'Each cell is route distance in kilometres. `?` means reachable in the supported directed graph with unresolved traffic-rule uncertainty. This is not independent confirmation of every real-world legal movement. Rows are origins, columns destinations; both orders were evaluated separately. `—` is the same entry. `Unavailable` means no evaluated route in this dataset. Full route metadata and connector/intersection lists are in [the matrix JSON](data/study-connectivity.json). Separate directed approach samples remain in the [verification summary](data/study-verification.json).', '',
    '| From / to | ' + ' | '.join(lookup) + ' |',
    '|---|' + '---:|' * len(entries),
]
for origin in entries:
    row = []
    for target in entries:
        if origin['id'] == target['id']:
            row.append('—')
        else:
            cell = cells[(origin['id'], target['id'])]
            row.append(f"{cell['route']['lengthMetres']/1000:.1f}?" if cell['route'] else 'Unavailable')
    lines.append('| ' + origin['id'] + ' | ' + ' | '.join(row) + ' |')
lines.extend(['', 'Entry key:', ''] + [f"- `{key}` — {label}" for key, label in lookup.items()])
(root / 'docs/connectivity-matrix.md').write_text('\n'.join(lines) + '\n')
lines = [
    '# Source-backed study intersections', '',
    'These are physical source-node records. Logical labels never create shortcut edges. All movement counts mean controller-selectable transitions under supported source rules; absent restrictions, signals and actual traffic legality remain unverified. A blank source-rule list does not mean unrestricted travel.', '',
    '| Listed roads | Latitude, longitude | OSM node | Logical junction label | Supported movements | Source rule IDs |',
    '|---|---|---|---|---:|---|',
]
for item in network['intersections']:
    lon, lat = item['position']
    names = ' × '.join(lookup[key] for key in item['entryIds'])
    moves = sum(len(movement['outgoing']) for movement in item['movements'])
    rules = ', '.join(map(str, item['restrictionIds'])) or 'None recorded'
    lines.append(f"| {names} | {lat:.7f}, {lon:.7f} | [{item['nodeId']}](https://www.openstreetmap.org/node/{item['nodeId']}) | {item['logicalId']} | {moves} | {rules} |")
lines.extend(['', 'Complete approaching/outgoing edge IDs, source way IDs, rule IDs, movement lists, connection types and verification status: [intersection JSON](data/study-intersections.json). Visually crossing lines without a shared source node are recorded separately and never become turns.'])
(root / 'docs/study-intersections.md').write_text('\n'.join(lines) + '\n')
