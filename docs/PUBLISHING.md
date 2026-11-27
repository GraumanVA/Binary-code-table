# Publishing the atlas

The [GitHub Pages workflow](../.github/workflows/pages.yml) builds and validates the table, runs the tests, and deploys `dist/` from the repository’s default `main` or `master` branch. In the repository’s **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source. Then run the workflow or push a commit to the default branch.

After deployment, check the table, a cell’s details, CSV export, and the editor at the URL reported by the workflow. The editor saves drafts in the contributor’s browser. A maintainer applies the exported bundle and commits the resulting data changes to publish them.

## Other static hosts and offline use

Run `python -m atlas build`, then publish the complete `dist/` directory. Asset and data URLs are relative, so the site works under a repository subdirectory. Keep all files from the same build together. The build removes stale files from `dist/`.

Open `build/coding_bounds.html` directly for the standalone table. It embeds its data and calculations. The full editor runs on the hosted site or through `python -m atlas serve`.

## Release packages

Run `python -m atlas package` to write these files under `build/release/`.

| File | Contents |
| --- | --- |
| `github-pages-source.zip` | Source, data, tests, documentation, and the Pages workflow. |
| `github-pages-site.zip` | The built static site. |
| `SHA256SUMS` | Checksums for the ZIP files. |

Keep a copy of the complete site package for any historical snapshot you need to reproduce.
