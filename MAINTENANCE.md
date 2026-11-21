# Maintaining the A(n,d) table

The maintained website reads bounds and references from separate JSON files. Edit the source data, rebuild, and publish `dist/`; no HTML or JavaScript changes are needed to add a paper or bound.

## Files to edit

| File                          | Purpose                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `data/literature_claims.json` | Add lower/upper bounds from new papers or communications.                              |
| `data/citations.json`         | Authors, year, full citation, and optional source link.                                |
| `data/brouwer_snapshot.csv`   | The manually imported Brouwer slice; edit only when reviewing a newer source snapshot. |
| `data/bound_references.json`  | Match a specific imported bound value to its reference.                                |
| `data/snapshot.json`          | Source dates, archive exclusions, and construction-type descriptions.                  |

Keep `index.html` and `refs.html` as the original archive inputs. The generated seed, HTML, and files under `dist/` are outputs, so edit their source files instead.

## Use the data editor

Run `python manage_coding_bounds.py serve`, then open **Update data** in the table footer. The editor is also included in the published website. Add or edit a reference, select it in the Bounds form, enter a lower or upper bound as an exact integer, and save to the browser draft. Existing literature records can be edited or marked inactive.

Download both source files and commit them together under `data/`. Alternatively, download an update bundle and run `python manage_coding_bounds.py apply bounds-update.json`. This checks the original dataset version, validates both files together, and rebuilds. No repository credentials are stored in the editor, and saving a browser draft does not publish it.

The editor preserves archive citation fingerprints and historical records. Corrections to imported table snapshots, exclusions, and bound-to-reference mappings use the source files listed above. The following section documents the equivalent manual process.

## Add a bound

1. Add the paper to `data/citations.json`, or reuse an existing reference key. A new reference has this shape:
   
   ```json
   "your-reference-key": {
     "authors": ["Surname", "Second surname"],
     "year": "2026",
     "citation": "Full author names. Paper title. Journal or preprint details, 2026.",
     "url": "https://example.org/paper"
   }
   ```
   
   Replace the example names and URL with the actual citation. Existing archive references have a `source_sha256` field: leave it unchanged when correcting their display text. It identifies the original citation independently of editorial wording.

2. Add a record to the list in `data/literature_claims.json`. This example uses a paper already registered in the project and demonstrates the format; it is not a new improvement:
   
   ```json
   {
     "id": "PAPER-MIL2026-17-3",
     "n": 17,
     "d": 3,
     "lower": "6144",
     "references": ["milshtein2026"],
     "source_locator": "arXiv:2610.23626, abstract",
     "active": true
   }
   ```
   
   Supply `lower`, `upper`, or both. Store bounds as exact decimal **strings**, so long integers keep all their digits. Parameters must be whole numbers from 1 to 512. Each `PAPER-...` ID must be unique, and all reference keys must exist in `data/citations.json`.
   
   Bounds are transferred automatically between parity-equivalent pairs. The table selects the strongest enabled lower and upper bounds, retains author credits, and includes the update in CSV export. The **Literature updates** option controls this layer.

3. Rebuild and validate:
   
   ```text
   python manage_coding_bounds.py build
   ```
   
   The build checks record structure, exact integers, citation keys, and contradictions against elementary bounds, imported sources, and other active updates. It also runs the existing consistency scan. Invalid input stops the build before a new website is rendered.

4. Inspect locally:
   
   ```text
   python manage_coding_bounds.py serve
   ```
   
   Open [the local table](http://127.0.0.1:8000/) in a browser. The command rebuilds first and serves only `dist/` on this computer. Stop it with Ctrl+C. Use `--port 8001` if port 8000 is occupied.

5. Publish the complete `dist/` directory using your static website host. No database or application server is required.

## Correct or withdraw a record

Correct author/year/citation display fields in `data/citations.json`. Raw archive text remains preserved. To withdraw a literature record, set `"active": false`; its history stays in the data, but it no longer contributes to bounds. An imported archive error can be listed under `editorial_exclusions` in `data/snapshot.json`.

When revising an imported Brouwer value, update the matching value/reference entry in `data/bound_references.json`. Reference assignments are value-matched, so an old citation will not silently attach to a replacement number. Expanding the original imported slice also requires updating its snapshot-specific validation expectations; new literature records do not have that restriction within the supported 1–512 parameter range.

## Published layout

`dist/index.html` contains the page shell and small configuration only. Styles, scripts, and the export worker live under `dist/assets/`. Bounds and references are separate files under `dist/data/`, connected by a versioned manifest. File names include content or snapshot identifiers to prevent cached files from different updates being combined.

Builds remove stale generated files from `dist/`. Keep the complete output together during deployment, and retain complete release packages separately when historical reproduction is needed. Links naming another dataset version produce a visible notice.

The self-contained `coding_bounds.html` is available for direct file opening and offline sharing. It intentionally embeds its data. The maintained `dist/` edition and editor need HTTP hosting or the local server command above. See [PUBLISHING.md](PUBLISHING.md) for the GitHub Pages workflow and distribution packages.

## Regression checks

```text
python -m unittest discover -s tests -p "test_*.py"
npm test
```

Node is needed only for development tests. With Node 24 in a restricted process environment, add `--test-isolation=none`.
