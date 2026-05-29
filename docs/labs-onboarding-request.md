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
- **Initial account to enroll:** <EEN_ACCOUNT_ID>  <!-- TODO: fill in -->

## Hosting / CI
- **GitHub org/repo:** <ORG>/<REPO>  <!-- TODO: confirm EENCloud vs current org; see spec risk #3 -->
- **Repo created by:** <you | platform team>  <!-- TODO -->
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
