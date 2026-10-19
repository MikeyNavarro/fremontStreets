# GitHub Pages deployment

The production URL for this repository is:

<https://mikeynavarro.github.io/fremontStreets/>

That address is the deployment target. It is available only after a successful
GitHub Pages deployment; committing the workflow alone does not publish a site.

## Repository settings

If Pages has not been enabled, a repository administrator must:

1. Open <https://github.com/MikeyNavarro/fremontStreets/settings/pages>.
2. Under **Build and deployment**, open **Source** and select **GitHub Actions**.
   Do not select a branch or create another starter workflow; this repository
   already provides `.github/workflows/pages.yml`.
3. Open <https://github.com/MikeyNavarro/fremontStreets/actions> and select
   **Test and deploy Fremont Streets** in the left sidebar.
4. If the first run failed before Pages was enabled, click **Run workflow**,
   select **main**, and click the green **Run workflow** button. Alternatively,
   open the failed run and choose **Re-run all jobs**.
5. Wait for both **Test and build** and **Deploy GitHub Pages** to show green
   check marks. Open the URL in the `github-pages` environment or in
   **Settings → Pages → Visit site**.

If a `github-pages` environment protection rule requests approval, open the
workflow run, choose **Review deployments**, select `github-pages`, and approve
the deployment. If repository or organization Actions policy blocks an action,
an administrator must allow the official actions referenced in the workflow.

The workflow uses GitHub's short-lived built-in token and OIDC for deployment.
No personal access token, repository secret, or game API key is needed.

## Build and validation

Every push to `main` builds, tests, and publishes the existing application.
Pull requests to `main` run the same checks without deploying. Manual workflow
runs from `main` can redeploy the latest tested source.

The workflow uses Node.js 24 and the committed dependency lockfile, runs unit
and geographic tests, runs the full development browser regression suite,
builds `dist/`, and runs production browser tests with `dist/` served under
`/fremontStreets/`. The production checks use a static HTTP server rather than
Vite. Only after all checks pass is that exact `dist/` artifact deployed.

To reproduce validation locally:

```sh
npm ci
npx playwright install chromium
npm test
npm run test:e2e
npm run build
npm run test:production
```

On Linux, Playwright may also need browser system dependencies:
`npx playwright install --with-deps chromium`. The CI workflow installs them.

Vite's production base path is `/fremontStreets/`. JavaScript, CSS, and public
geographic data must resolve below that path; a root-relative `/data/...` URL
would request the wrong directory on GitHub Pages. Keep the production tests
when adding assets or changing runtime loading. The three geographic/catalog JSON
requests carry a content fingerprint compiled into the release; preserve this
cache key when updating the data so Pages cannot mix stale roads with a new
study catalog.

## Runtime and saved progress

GitHub Pages serves a static production build. The game needs no Vite server,
cloud preview, private service, API key, or gameplay-time geographic import.
The road network, map data, and zone GeoJSON are shipped with the site. Existing
coverage and geographic provenance remain documented in [geography.md](geography.md)
and [patrol-sources.md](patrol-sources.md).

Progress and saved practice routes are stored in the browser's local storage.
They persist between visits on the same browser and site origin, but progress
from `localhost` or a cloud preview does not automatically transfer to the
GitHub Pages origin. Clearing site data also clears locally saved progress.

The developer boundary editor stays disabled in production. Normal driving,
both camera views, learning modes, quizzes, and saved progress remain available.

## Diagnosing publication failures

- A **Check Pages configuration** failure usually means the repository's Pages
  source has not been switched to **GitHub Actions**. Enable it using the steps
  above and rerun the workflow.
- A red build or test step prevents publication. Open that step's log, correct
  the cause, and push the fix; the previously deployed site remains in place.
- A deploy waiting for approval requires the environment approval described
  above. A deployment can also be blocked by repository or organization policy.
- A Pages 404 is not evidence of a successful deployment. Confirm a green
  deployment first, then visit the exact mixed-case `/fremontStreets/` path.

Before reporting a deployment as live, verify the successful deployment run
and visit the resulting URL to confirm the game and its geographic assets load.
