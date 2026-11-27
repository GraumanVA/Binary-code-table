# Sources and attribution

`data/sources/index.html` and `data/sources/refs.html` preserve the supplied Litsyn–Rains–Sloane archive and bibliography. The application displays reviewed author and citation metadata from `data/citations.json`.

`data/snapshot.json` records the scope, source dates, and editorial exclusions. `data/brouwer_snapshot.csv` is a dated imported slice, not a live synchronization with Brouwer’s tables. `data/bound_references.json` attaches paper citations only to matching imported bound values. Additional published results belong in `data/literature_claims.json` with supporting references.

Grassl’s CodeTables supplies binary linear-code constructions. The normalized source in `data/sources/grassl_binary.csv` is a partial recovery from the earlier improvements file. The capture status and checksums are recorded in `data/sources/grassl_snapshot.json`. Each witness links to its construction, and `data/grassl_references.json` records specific publication and contributor credits where identified.

This package does not establish ownership of third-party material or grant a new license for it. No repository-wide license has been selected. Before public distribution, the repository owner should review source reuse terms and choose appropriate licensing for original code. Attribution alone is not a substitute for any required permission.

Mathematical validation checks internal consistency and stated formulas. It does not independently prove the constructions or results cited in the literature.
