# Maintaining the A(n,d) table

Open a table entry and choose **Update this entry** to draft a published lower bound, upper bound, or citation correction. The editor shows records for the selected parameters and their parity partner. Save the reference and bound, review the changes, and download the update bundle.

## Work locally

Install Python 3.10 or newer. The table builds with the standard library.

```sh
python -m atlas serve
```

Open <http://127.0.0.1:8000/>. Use `--port 8001` to change the port. Apply a downloaded change bundle with:

```sh
python -m atlas apply bounds-update.json
```

The bundle records edits to individual entries and references. The CLI merges independent edits and reports conflicts when the same record has changed. Review the resulting diff and commit the source data. GitHub Pages builds the table from those sources.

## Edit data directly

| File | Purpose |
| --- | --- |
| `data/literature_claims.json` | Lower and upper bounds from papers or communications. |
| `data/citations.json` | Reference keys, author labels, publication details and links. |
| `data/brouwer_snapshot.csv` | Imported slice of Brouwer’s small-code table. |
| `data/bound_references.json` | Side-specific references attached to exact Brouwer bound values. |
| `data/grassl_references.json` | Reviewed credits keyed by the code witness `[code_n, k, code_d]`. |
| `data/sources/grassl_binary.csv` | Construction witnesses from CodeTables, stored independently of the table’s other sources. |
| `data/sources/grassl_snapshot.json` | CodeTables source URL, capture status and checksums. |
| `data/snapshot.json` | Source metadata, editorial exclusions and construction types. |
| `data/sources/` | Historical archive inputs. |

Create a citation key in `data/citations.json`, or reuse a reference already present. An example bound record is:

```json
{
  "id": "PAPER-MIL2026-17-3",
  "n": 17,
  "d": 3,
  "lower": "6144",
  "lower_references": ["milshtein2026"],
  "lower_source_locator": "Abstract",
  "active": true
}
```

Use `upper`, `upper_references`, and `upper_source_locator` for an upper-bound claim. If a record contains both sides, give each side its own supporting references. Bounds are exact positive decimal strings. Legacy records using shared `references` and `source_locator` remain readable.

Set `active` to `false` to withdraw a literature claim and keep its history. When correcting an archive citation, keep its `source_sha256` fingerprint. When changing an imported Brouwer value, review its exact-value reference mappings at the same time.

For Grassl credits, add a group to `data/grassl_references.json` with `references`, `codes`, and an optional `note`. The build also credits published Cordaro–Wagner, Solomon–Stiffler, and BCH constructions where the parameters suffice. Each witness retains its CodeTables construction link.

## Refresh CodeTables

Save the [complete binary table](https://www.codetables.de/BKLC/Tables.php?q=2&n0=1&n1=256&k0=1&k1=256) as HTML and record the date you saved it. Run the import using that date:

```sh
python -m atlas import-grassl saved-table.html --captured YYYY-MM-DD
```

The importer records the normalized source and checksums. The checked-in snapshot is partial because it was recovered from the earlier improvements file. Its original capture date is unknown.

## Validate and build

```sh
python -m atlas check
python -m atlas build
python -m unittest discover -s tests -p 'test_*.py'
npm test
```

`check` validates the sources without generating the website. `build` writes `dist/` for deployment and `build/` for local artifacts, including the offline table and validation report. Use Node 24 for the JavaScript tests. The tests use the generated site and offline edition, so build before running them.
