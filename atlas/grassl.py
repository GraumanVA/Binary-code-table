"""Normalize and read the binary linear-code witnesses in Grassl's CodeTables."""

import csv
from datetime import date
from hashlib import sha256
from html.parser import HTMLParser
import io
import json
import re
from urllib.parse import parse_qs, urlsplit

from .claims import existing_bounds

WITNESS_FIELDS = ('code_n', 'k', 'code_d')
SOURCE_FIELDS = (*WITNESS_FIELDS, 'upper_distance', 'construction')
SOURCE_FILE = 'grassl_binary.csv'
METADATA_FILE = 'grassl_snapshot.json'
PROVENANCE_FIELDS = ('snapshot_kind', 'date', 'source_url', 'html_sha256', 'normalized_sha256', 'note')
MAX_LENGTH = 256
SOURCE_URL = 'https://www.codetables.de/BKLC/Tables.php?q=2&n0=1&n1=256&k0=1&k1=256'
CELL_VALUE = re.compile(r'(\d+)(?:-(\d+))?')


class CodeTable(HTMLParser):
    """Read distance intervals and the source's missing-construction marker."""

    def __init__(self):
        super().__init__()
        self.cells = {}
        self.missing = False
        self.coordinates = None
        self.text = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'td':
            self.missing = attrs.get('bgcolor', '').lstrip('#').lower() == 'ffa0a0'
        if tag == 'a':
            link = urlsplit(attrs.get('href', ''))
            args = parse_qs(link.query)
            if (link.path.rsplit('/', 1)[-1] == 'BKLC.php' and args.get('q') == ['2']
                    and all(len(args.get(key, ())) == 1 for key in ('n', 'k'))):
                self.coordinates = int(args['n'][0]), int(args['k'][0])
                self.text = []

    def handle_data(self, data):
        if self.coordinates is not None:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == 'td':
            self.missing = False
        if tag != 'a' or self.coordinates is None:
            return
        n, k = self.coordinates
        value = CELL_VALUE.fullmatch(''.join(self.text).strip())
        if not value or self.coordinates in self.cells:
            raise ValueError(f'Invalid or duplicate CodeTables cell [{n},{k}]')
        lower = int(value[1])
        upper = int(value[2] or lower)
        if not 1 <= k <= n <= MAX_LENGTH or not 1 <= lower <= upper <= n:
            raise ValueError(f'Invalid distance interval at [{n},{k}]')
        self.cells[self.coordinates] = lower, upper, not self.missing
        self.coordinates = None


def complete_coordinates():
    return {(n, k) for n in range(1, MAX_LENGTH + 1) for k in range(1, n + 1)}


def select_witnesses(cells):
    """Choose the strongest construction for each odd-distance pair within this source."""
    by_length = {}
    for (n, k), (d, _, construction) in sorted(cells.items(), reverse=True):
        if construction and d >= 3:
            by_length.setdefault(n, []).append((k, d))
    for n in range(1, MAX_LENGTH + 1):
        direct = by_length.get(n, ())
        extended = by_length.get(n + 1, ())
        for d in range(3, n + 1, 2):
            k, code_d = next(((k, distance) for k, distance in direct if distance >= d), (0, 0))
            partner = next(((k, distance) for k, distance in extended if distance >= d + 1), (0, 0))
            code_n = n
            if partner[0] > k:
                k, code_d = partner
                code_n = n + 1
            if k:
                yield dict(n=n, d=d, code_n=code_n, k=k, code_d=code_d)


def load_source(source_dir, dataset):
    """Load the normalized source and check its witnesses against unrestricted bounds."""
    metadata = json.loads((source_dir / METADATA_FILE).read_text(encoding='utf-8'))
    # Git on Windows may check the canonical LF CSV out with CRLF line endings.
    contents = (source_dir / SOURCE_FILE).read_bytes().replace(b'\r\n', b'\n')
    if metadata['normalized_sha256'] != sha256(contents).hexdigest():
        raise ValueError('Grassl source does not match its recorded SHA-256')
    cells = {}
    reader = csv.DictReader(io.StringIO(contents.decode('utf-8'), newline=''))
    if tuple(reader.fieldnames or ()) != SOURCE_FIELDS:
        raise ValueError('Unexpected Grassl CSV columns')
    for row in reader:
        n, k, d = (int(row[field]) for field in WITNESS_FIELDS)
        upper = int(row['upper_distance']) if row['upper_distance'] else None
        construction = row['construction']
        if ((n, k) in cells or not 1 <= k <= n <= MAX_LENGTH or not 1 <= d <= n
                or (upper is not None and not d <= upper <= n) or construction not in ('0', '1')):
            raise ValueError(f'Invalid or duplicate Grassl record [{n},{k},{d}]')
        cells[n, k] = d, upper, construction == '1'

    kind = metadata['snapshot_kind']
    captured = metadata['date']
    if (kind not in ('partial', 'complete') or metadata.get('source_url') != SOURCE_URL
            or (captured is not None and date.fromisoformat(captured).isoformat() != captured)):
        raise ValueError('Invalid Grassl snapshot provenance')
    if kind == 'complete' and (cells.keys() != complete_coordinates() or not captured
                               or not re.fullmatch(r'[0-9a-f]{64}', metadata.get('html_sha256') or '')
                               or any(upper is None for _, upper, _ in cells.values())):
        raise ValueError('A complete Grassl snapshot requires all binary table cells, a capture date, and an HTML checksum')
    lookup = existing_bounds(dataset)
    rows = list(select_witnesses(cells))
    for row in rows:
        _, upper = lookup(row['n'], row['d'])
        if 2**row['k'] > upper:
            raise ValueError(f"Grassl [{row['code_n']},{row['k']},{row['code_d']}] exceeds the upper bound at A({row['n']},{row['d']})")
    dataset['metadata']['grassl'].update({key: metadata[key] for key in PROVENANCE_FIELDS if key in metadata},
                                        source_cells=len(cells))
    return rows


def write_capture(destination, files):
    destination.mkdir(parents=True, exist_ok=True)
    lock = destination / '.grassl-import.lock'
    try:
        lock.touch(exist_ok=False)
    except FileExistsError as error:
        raise ValueError('Another Grassl import is replacing this snapshot') from error
    staged = {}
    replaced = []
    try:
        originals = {name: (destination / name).read_bytes() if (destination / name).exists() else None
                     for name in files}
        for name, content in files.items():
            temporary = destination / f'.{name}.pending'
            with temporary.open('xb') as stream:
                staged[name] = temporary
                stream.write(content)
        for name, temporary in staged.items():
            temporary.replace(destination / name)
            replaced.append(name)
    except OSError:
        for name in reversed(replaced):
            target = destination / name
            if originals[name] is None:
                target.unlink()
            else:
                target.write_bytes(originals[name])
        raise
    finally:
        for temporary in staged.values():
            temporary.unlink(missing_ok=True)
        lock.unlink()


def import_snapshot(html, destination, captured):
    """Normalize a saved complete GF(2) table without consulting competing bounds."""
    if date.fromisoformat(captured).isoformat() != captured:
        raise ValueError('Use YYYY-MM-DD for the capture date')
    raw = html.read_bytes()
    table = CodeTable()
    table.feed(raw.decode('utf-8-sig'))
    table.close()
    if table.cells.keys() != complete_coordinates():
        raise ValueError('Expected the complete GF(2) table, with every 1 <= k <= n <= 256')
    stream = io.StringIO(newline='')
    writer = csv.writer(stream, lineterminator='\n')
    writer.writerow(SOURCE_FIELDS)
    for (n, k), (d, upper, construction) in sorted(table.cells.items()):
        writer.writerow((n, k, d, upper, int(construction)))
    contents = stream.getvalue().encode('utf-8')
    metadata = dict(snapshot_kind='complete', date=captured, source_url=SOURCE_URL,
                    html_sha256=sha256(raw).hexdigest(), normalized_sha256=sha256(contents).hexdigest())
    write_capture(destination, {SOURCE_FILE: contents,
                                METADATA_FILE: (json.dumps(metadata, indent=2) + '\n').encode('utf-8')})
    return len(table.cells)


def solomon_stiffler_applies(n, k, d):
    # Puncture copies of the simplex code along subspaces. The binary digits
    # of the distance deficit give their dimensions, counted starting at one.
    weight = 1 << (k - 1)
    copies = (d + weight - 1) // weight
    deficit = copies * weight - d
    dimensions = [i + 1 for i in range(deficit.bit_length()) if deficit & (1 << i)]
    length = copies * ((1 << k) - 1) - sum((1 << dim) - 1 for dim in dimensions)
    return sum(dimensions) <= k * copies and length <= n


def primitive_bch_codes():
    """Yield length, dimension and guaranteed distance of primitive binary BCH codes."""
    for m in range(3, MAX_LENGTH.bit_length()):
        length = (1 << m) - 1
        roots = set()
        for exponent in range(1, length):
            conjugate = exponent
            while conjugate not in roots:
                roots.add(conjugate)
                conjugate = (2 * conjugate) % length
            if exponent % 2 == 0:
                dimension = length - len(roots)
                yield length, dimension, exponent + 1
                yield length + 1, dimension, exponent + 2  # Even parity extension.


def bch_attribution(n, k, d, parent_codes):
    # Shortening spends dimension, while puncturing spends distance.
    candidates = [code for code in parent_codes if code[1] >= k and code[2] >= d
                  and code[0] - n <= code[1] - k + code[2] - d]
    if not candidates:
        return None
    length, dimension, distance = min(candidates, key=lambda code: (
        abs(code[0] - n) + code[1] - k, -code[2]))
    removed = max(0, length - n)
    shortened = min(removed, dimension - k)
    operations = []
    if shortened:
        operations.append(f'shorten {shortened} coordinates')
    if removed > shortened:
        operations.append(f'puncture {removed - shortened} coordinates')
    if length < n:
        operations.append(f'append {n - length} zero coordinates')
    if dimension - shortened > k:
        operations.append(f'take a subcode of dimension {k}')
    family = 'Parity-extended primitive BCH' if length % 2 == 0 else 'Primitive BCH'
    note = f'{family} code of length {length}, dimension {dimension}, and distance at least {distance}.'
    if operations:
        note += ' To obtain the cited bound, ' + ', then '.join(operations) + '.'
    return ['bose60', 'hoqu59'], note


def add_attribution(rows, path, citations):
    """Use reviewed witness matches first, then published families that certify the parameters."""
    curated = {}
    for group in json.loads(path.read_text(encoding='utf-8')):
        references = group['references']
        if not isinstance(references, list) or not references or any(
                not isinstance(key, str) or key not in citations for key in references):
            raise ValueError(f'Unknown Grassl construction reference in {references}')
        for code in group['codes']:
            if len(code) != 3 or any(type(value) is not int for value in code):
                raise ValueError(f'Invalid Grassl construction parameters: {code}')
            key = tuple(code)
            n, k, d = key
            if key in curated or not (1 <= k <= n <= MAX_LENGTH and 1 <= d <= n):
                raise ValueError(f'Invalid or duplicate Grassl reference for {code}')
            curated[key] = references, group.get('note', '')

    bch_codes = tuple(primitive_bch_codes())
    attributions = dict(curated)
    for row in rows:
        code = tuple(row[field] for field in WITNESS_FIELDS)
        n, k, d = code
        if code not in attributions:
            if k == 2 and d == 2 * n // 3:
                attributions[code] = ['cord67'], 'The Cordaro–Wagner construction attains these parameters.'
            elif solomon_stiffler_applies(n, k, d):
                attributions[code] = ['solomon-stiffler1965'], 'The Solomon–Stiffler punctured-simplex construction attains these parameters.'
            else:
                attributions[code] = bch_attribution(n, k, d, bch_codes)
        if attribution := attributions[code]:
            references, note = attribution
            if any(key not in citations for key in references):
                raise ValueError(f'Unknown Grassl construction reference in {references}')
            row.update(references=references, reference_note=note)


