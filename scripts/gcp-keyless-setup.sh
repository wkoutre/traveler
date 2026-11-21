#!/usr/bin/env bash
# Keyless GitHub -> Chrome Web Store sign-in for wkoutre/traveler.
#
# Traveler shares Keyline's Google Cloud project, workload identity pool and
# publisher service account (the service account is already registered with
# the Chrome Web Store publisher account). This adds a provider that only
# accepts this repository's publish job on main in the chrome-web-store
# environment, and lets that identity act as the publisher.
#
# Run in Cloud Shell (or any gcloud signed in as the project owner). Re-runnable.
set -euo pipefail
PROJECT=keyline-cws
REPO_ID=1465873574          # wkoutre/traveler (created as cmdk-chrome); pins the repo across renames
ENVIRONMENT=chrome-web-store
SA=keyline-publisher
PROVIDER=traveler

gcloud config set project "$PROJECT"
NUM=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool=github >/dev/null 2>&1 ||
gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
  --location=global --workload-identity-pool=github \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping='google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref,attribute.environment=assertion.environment' \
  --attribute-condition="assertion.repository_id=='${REPO_ID}' && assertion.ref=='refs/heads/main' && assertion.environment=='${ENVIRONMENT}'"

gcloud iam service-accounts add-iam-policy-binding "${SA}@${PROJECT}.iam.gserviceaccount.com" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/${NUM}/locations/global/workloadIdentityPools/github/attribute.repository_id/${REPO_ID}"

echo "GCP_WORKLOAD_IDENTITY_PROVIDER=projects/${NUM}/locations/global/workloadIdentityPools/github/providers/${PROVIDER}"
echo "GCP_SERVICE_ACCOUNT=${SA}@${PROJECT}.iam.gserviceaccount.com"
