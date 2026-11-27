"""Import lower-bound improvements from Grassl's complete binary CodeTables page."""

import argparse
import csv
from html.parser import HTMLParser
import json
from pathlib import Path
import re

from coding_bounds_claims import existing_bounds

FIELDS = ('n', 'd', 'code_n', 'k', 'code_d')
MAX_LENGTH = 256
CELL_LINK = re.compile(r'BKLC\.php\?q=2&n=(\d+)&k=(\d+)')
CELL_VALUE = re.compile(r'(\d+)(?:-(\d+))?')


class CodeTable(HTMLParser):
    """Read the lower endpoint and the source's missing-construction marker."""

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
            match = CELL_LINK.fullmatch(attrs.get('href', ''))
            if match:
                self.coordinates = tuple(map(int, match.groups()))
                self.text = []

    def handle_data(self, data):
        if self.coordinates is not None:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag != 'a' or self.coordinates is None:
            return
        n, k = self.coordinates
        value = CELL_VALUE.fullmatch(''.join(self.text).strip())
        if not value or self.coordinates in self.cells:
            raise ValueError(f'Invalid or duplicate CodeTables cell [{n},{k}]')
        lower = int(value[1])
        if not 1 <= lower <= int(value[2] or lower) <= n:
            raise ValueError(f'Invalid distance interval at [{n},{k}]')
        self.cells[self.coordinates] = None if self.missing else lower
        self.coordinates = None


def select_improvements(cells, dataset):
    """Keep the largest 2^k beating the atlas, once per parity-equivalent pair."""
    lookup = existing_bounds(dataset)
    codes = {
        n: [(k, cells[n, k]) for k in range(n, 0, -1) if cells[n, k] is not None]
        for n in range(1, MAX_LENGTH + 1)
    }
    for n, same_length in codes.items():
        next_length = codes.get(n + 1, [])
        for d in range(3, n + 1, 2):
            direct = next(((k, dist) for k, dist in same_length if dist >= d), (0, 0))
            partner = next(((k, dist) for k, dist in next_length if dist >= d + 1), (0, 0))
            code_n, (k, code_d) = (n + 1, partner) if partner[0] > direct[0] else (n, direct)
            lower, upper = lookup(n, d)
            if 2**k > upper:
                raise ValueError(f'CodeTables [{code_n},{k},{code_d}] exceeds the upper bound at A({n},{d})')
            if 2**k > lower:
                yield n, d, code_n, k, code_d


def load_improvements(path, dataset):
    """Validate the stored witnesses against the current unrestricted upper bounds."""
    lookup = existing_bounds(dataset)
    seen = set()
    rows = []
    with path.open(encoding='utf-8', newline='') as stream:
        reader = csv.DictReader(stream)
        if tuple(reader.fieldnames or ()) != FIELDS:
            raise ValueError('Unexpected Grassl CSV columns')
        for row in reader:
            n, d, code_n, k, code_d = (int(row[field]) for field in FIELDS)
            if ((n, d) in seen or not (3 <= d <= n <= MAX_LENGTH and d % 2)
                    or code_n not in (n, n + 1) or not 1 <= k <= code_n <= MAX_LENGTH
                    or not d + code_n - n <= code_d <= code_n):
                raise ValueError(f'Invalid Grassl witness [{code_n},{k},{code_d}] for A({n},{d})')
            seen.add((n, d))
            _, upper = lookup(n, d)
            if 2**k > upper:
                raise ValueError(f'Grassl [{code_n},{k},{code_d}] exceeds the upper bound at A({n},{d})')
            rows.append(dict(zip(FIELDS, (n, d, code_n, k, code_d))))
    return rows


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
        code = tuple(row[field] for field in FIELDS[2:])
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


def main():
    from build_coding_bounds import ROOT, build_dataset

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('html', type=Path, help='Saved complete GF(2) table from codetables.de')
    parser.add_argument('--output', type=Path, default=ROOT / 'data/grassl_improvements.csv')
    args = parser.parse_args()
    table = CodeTable()
    table.feed(args.html.read_text(encoding='utf-8'))
    table.close()
    expected = {(n, k) for n in range(1, MAX_LENGTH + 1) for k in range(1, n + 1)}
    if table.cells.keys() != expected:
        raise ValueError('Expected the complete GF(2) table, with every 1 ≤ k ≤ n ≤ 256')
    rows = list(select_improvements(table.cells, build_dataset(include_grassl=False)))
    with args.output.open('w', encoding='utf-8', newline='') as stream:
        writer = csv.writer(stream, lineterminator='\n')
        writer.writerow(FIELDS)
        writer.writerows(rows)
    missing = sum(value is None for value in table.cells.values())
    print(f'Compared {len(table.cells):,} cells ({missing:,} marked missing); kept {len(rows):,} parity-distinct improvements.')


if __name__ == '__main__':
    main()
