# Publish with GitHub Pages

## First publication

1. Extract `release/github-pages-source.zip` into an empty repository folder. The ZIP contains repository files at its root, including `.github/workflows/pages.yml`; preserve hidden files when copying.
2. Create a GitHub repository and commit these files to its default `main` or `master` branch. GitHub Desktop or Git can upload the folder. Do not substitute the original root `index.html` for the generated website: it is an importer input.
3. In the repository’s **Settings → Pages → Build and deployment**, choose **GitHub Actions** as the source.
4. Open **Actions → Validate and publish GitHub Pages** and run the workflow on the default branch, or push a commit after enabling Pages.
5. Once the workflow succeeds, its `github-pages` deployment provides the public URL. Check the table, a cell’s details, CSV download, and **Update data** at that address.

The workflow builds with Python 3.13 and Node 24, checks data and application behavior, uploads only `dist/`, and deploys after all checks pass. Pull requests build and test without deploying. It uses GitHub’s built-in token with deployment permissions limited to the deployment job; no personal token or site credentials are needed.

GitHub documents the [Pages publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site) and the [official static-site workflow](https://github.com/actions/starter-workflows/blob/main/pages/static.yml). Pages availability depends on the repository’s visibility and account plan; see [About GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

## Later updates

Open the published editor, save changes to its browser draft, then download both source files and commit them together under `data/`. The workflow rebuilds and publishes the new snapshot. The public editor cannot write to the repository; visitors’ drafts stay in their own browsers.

For local work, use `python manage_coding_bounds.py apply bounds-update.json` to apply an exported bundle, review the changed files, then commit them. Bundles from a different dataset version are rejected so an older draft cannot silently overwrite newer work. Reopen the current editor and reconcile those changes if the underlying data has moved on.

## Package contents

| Package | Contents | Intended use |
| --- | --- | --- |
| `github-pages-source.zip` | Data, application source, original importer inputs, build tools, tests, documentation, and Pages workflow | Maintainable GitHub repository |
| `github-pages-site.zip` | `index.html`, `editor.html`, `.nojekyll`, release metadata, and versioned assets/data | Deployment to a static host |
| `SHA256SUMS` | SHA-256 checksums of both ZIPs | Verify package integrity |

The site uses relative links and works under a repository subdirectory such as `https://owner.github.io/repository/`. No domain-specific path, server, database, or dependency installation is required. If a custom domain is added later, configure it in GitHub Pages and preserve the corresponding domain settings separately.

Builds replace stale generated files in `dist/`; do not keep hand-written files there. Archive complete release ZIPs if historical reproduction is needed. A snapshot identifier detects mismatched data and shared links, but is not itself a historical hosting service.

Before inviting public contributions, choose a license for your own code and review the supplied source material’s reuse terms. This package preserves its citations and does not assign a new license to third-party material.
