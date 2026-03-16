#!/usr/bin/env bash
#
# DreamLoom — Deployment script for Google Cloud Run
#
# Usage: ./infra/deploy.sh [PROJECT_ID] [REGION]
#
set -euo pipefail

# Ensure gcloud is in PATH
if [ -d "$HOME/google-cloud-sdk/bin" ]; then
  export PATH="$HOME/google-cloud-sdk/bin:$PATH"
fi

PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${2:-${GOOGLE_CLOUD_REGION:-us-central1}}"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: PROJECT_ID is required."
  echo "Usage: ./infra/deploy.sh <PROJECT_ID> [REGION]"
  exit 1
fi

REPO_NAME="dreamloom"
BACKEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/backend"
FRONTEND_IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/frontend"
BACKEND_SERVICE="dreamloom-backend"
FRONTEND_SERVICE="dreamloom-frontend"

echo "=== DreamLoom Deployment ==="
echo "Project:  ${PROJECT_ID}"
echo "Region:   ${REGION}"
echo ""

# Enable required APIs
echo ">> Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  storage.googleapis.com \
  aiplatform.googleapis.com \
  firestore.googleapis.com \
  --project="${PROJECT_ID}" --quiet

# Create Artifact Registry repository if it doesn't exist
echo ">> Setting up Artifact Registry..."
gcloud artifacts repositories describe "${REPO_NAME}" \
  --project="${PROJECT_ID}" --location="${REGION}" 2>/dev/null || \
gcloud artifacts repositories create "${REPO_NAME}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --repository-format=docker --quiet

# Set up GCS bucket for media
echo ">> Setting up GCS bucket..."
BUCKET_NAME="dreamloom-media-${PROJECT_ID}"
gcloud storage buckets create "gs://${BUCKET_NAME}" \
  --project="${PROJECT_ID}" --location="${REGION}" \
  --uniform-bucket-level-access 2>/dev/null || true

# Set CORS and public access
CORS_FILE=$(mktemp)
echo '[{"origin": ["*"], "method": ["GET"], "responseHeader": ["Content-Type"], "maxAgeSeconds": 3600}]' > "${CORS_FILE}"
gcloud storage buckets update "gs://${BUCKET_NAME}" --cors-file="${CORS_FILE}" 2>/dev/null || true
rm -f "${CORS_FILE}"
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET_NAME}" \
  --member=allUsers --role=roles/storage.objectViewer 2>/dev/null || true

# Load env vars for backend deployment
GOOGLE_API_KEY="${GOOGLE_API_KEY:-}"
if [ -z "$GOOGLE_API_KEY" ] && [ -f .env ]; then
  GOOGLE_API_KEY=$(grep '^GOOGLE_API_KEY=' .env | cut -d= -f2-)
fi
if [ -z "$GOOGLE_API_KEY" ]; then
  echo "Error: GOOGLE_API_KEY not set. Export it or add to .env"
  exit 1
fi

# ── Build and deploy backend ──
echo ""
echo ">> Building backend image..."
gcloud builds submit \
  --tag "${BACKEND_IMAGE}" \
  --project="${PROJECT_ID}" \
  backend/

echo ">> Deploying backend to Cloud Run..."
gcloud run deploy "${BACKEND_SERVICE}" \
  --image="${BACKEND_IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8000 \
  --memory=1Gi \
  --cpu=2 \
  --timeout=3600 \
  --concurrency=80 \
  --min-instances=0 \
  --max-instances=3 \
  --session-affinity \
  --set-env-vars="GOOGLE_API_KEY=${GOOGLE_API_KEY},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_REGION=${REGION},GCS_BUCKET_NAME=${BUCKET_NAME}" \
  --quiet

BACKEND_URL=$(gcloud run services describe "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format="value(status.url)")

echo "Backend URL: ${BACKEND_URL}"

# ── Build and deploy frontend ──
echo ""
echo ">> Building frontend image..."
cd frontend

# Write .env.production so Vite bakes in the backend URLs
WS_URL="${BACKEND_URL/https/wss}/ws"
cat > .env.production << EOF
VITE_WS_URL=${WS_URL}
VITE_API_URL=${BACKEND_URL}
EOF
echo "   VITE_WS_URL=${WS_URL}"
echo "   VITE_API_URL=${BACKEND_URL}"

gcloud builds submit \
  --tag "${FRONTEND_IMAGE}" \
  --project="${PROJECT_ID}" \
  .

# Clean up .env.production after build
rm -f .env.production
cd ..

echo ">> Deploying frontend to Cloud Run..."
gcloud run deploy "${FRONTEND_SERVICE}" \
  --image="${FRONTEND_IMAGE}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --port=8080 \
  --memory=256Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --set-env-vars="BACKEND_URL=${BACKEND_URL}" \
  --quiet

FRONTEND_URL=$(gcloud run services describe "${FRONTEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format="value(status.url)")

# Update backend CORS with frontend URL
echo ""
echo ">> Updating backend CORS..."
gcloud run services update "${BACKEND_SERVICE}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --update-env-vars="^||^CORS_ORIGINS=${FRONTEND_URL},http://localhost:5173" \
  --quiet

echo ""
echo "=== Deployment Complete ==="
echo "Frontend: ${FRONTEND_URL}"
echo "Backend:  ${BACKEND_URL}"
echo "Bucket:   gs://${BUCKET_NAME}"
echo ""
echo "Open ${FRONTEND_URL} to start creating stories!"
