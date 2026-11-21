# A(n,d) Atlas

A static, searchable table of lower and upper bounds for binary codes. Select a cell to see its sources, author credits, exact values, and derivations. Distances default to odd values; parity-equivalent entries share their bounds.

The table combines the supplied Litsyn archive, a dated Brouwer snapshot, literature updates, and elementary bounds including Hamming and Johnson. It reports the strongest bounds among the enabled sources. Coverage and source dates are stated on the page; this is not an exhaustive survey of all published bounds.

## Run locally

Install Python 3.10 or newer, then run:

```text
python manage_coding_bounds.py serve
```

Open <http://127.0.0.1:8000/>. The command validates the data, builds the site, and starts a local server. No Python packages or frontend dependencies are required. Stop the server with Ctrl+C.

`python manage_coding_bounds.py build` builds without starting a server. It produces:

- `dist/`: the complete website, including the table, editor, scripts, and separate data files.
- `coding_bounds.html`: a self-contained table for offline use. The editor requires the hosted site or local server.
- Import CSVs and a mathematical validation report for inspection.

## Update bounds and references

Open **Update data** in the table footer, or **Update this entry** in a cell’s details. Add or edit a reference, select its authors, enter an exact lower or upper bound, and save it to the draft. The forms check references and reject contradictions with the current data.

Drafts stay in your browser. Download **bounds** and **references**, replace `data/literature_claims.json` and `data/citations.json` in the repository, and commit them together. Alternatively, download an **update bundle** and apply it locally:

```text
python manage_coding_bounds.py apply bounds-update.json
```

The command validates the bundle against its original snapshot before replacing the two source files and rebuilding. Review the resulting changes before committing. The editor changes the literature layer and citation display metadata; historical source snapshots remain separate.

See [MAINTENANCE.md](MAINTENANCE.md) for data formats, corrections, and withdrawals.

## Publish

The included [GitHub Pages workflow](.github/workflows/pages.yml) builds and tests the source, then deploys `dist/` from the repository’s default `main` or `master` branch. Select **GitHub Actions** as the repository’s Pages source. See [PUBLISHING.md](PUBLISHING.md) for setup and package contents.

Prepare both distribution packages with:

```text
python manage_coding_bounds.py package
```

Use `release/github-pages-source.zip` to initialize the repository. `release/github-pages-site.zip` contains only the built static site for a host that accepts ready-made files. No publication is performed by the packaging command.

## Development checks

Build first, then run Python tests and the browser-logic tests with Node 24:

```text
python manage_coding_bounds.py build
python -m unittest discover -s tests -p "test_*.py"
npm test
```

Application source lives under `src/`; editable data lives under `data/`. Root `index.html` and `refs.html` are original archive inputs, not the website entry point. Generated output is excluded from version control. Source attribution and reuse considerations are recorded in [NOTICE.md](NOTICE.md).
