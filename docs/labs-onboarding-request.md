# Brivo Labs onboarding request — observation-app

**To:** Eric Janik (eric@een.com)
**Hosting shape:** Labs-proxied (Path B)

## Product
- **Slug:** `observation-app`
- **Name:** EEN Camera Observation App
- **Tagline:** Live + recorded multi-camera monitoring with events and alerts.
- **Has UI:** yes
- **Requires approval:** no (account-level grant)

## Vendors
- `een` (required) — the app calls the EEN v3.0 API with the brokered vendor token.

## Access
- **Model:** account-level grant.
- **Initial account to enroll:** khofrichter@een.com

## Hosting / CI
- **GitHub org/repo:** `klaushofrichter/een-observation-app` — the Labs Path B
  work currently lives on branch `feature/brivo-labs-integration` (not yet
  merged to `develop`). Please scope the OIDC trust policy to this org/repo
  (it is not under the `EENCloud` org).
- **Repo created by:** klaushofrichter (the repo already exists).
- Container listens on `0.0.0.0:8080`. Helm chart at `charts/observation-app/`,
  Service name `een-labs-observation-app`, port 8080.

## What we need back
- ECR repository URL (`een-labs-observation-app`).
- IAM role ARN (`een-labs-ecr-push-observation-app`) for GitHub OIDC.
- Confirmed GitHub repo path for the OIDC trust policy.
- `proxyTarget` wired to
  `http://een-labs-observation-app.experiments.svc.cluster.local:8080`
  after the first deploy. (The Helm chart names the Service after
  `Chart.name` = `een-labs-observation-app`, which is also the ECR repo name.)

## Candidacy notes
- Single auth-gated Service, no unauthenticated inbound paths (no webhooks).
- Single replica, static SPA + nginx. No multi-service architecture.
- No secrets required in the container (Labs-only auth).
