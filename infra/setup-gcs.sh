#!/usr/bin/env bash
#
# Set up GCS bucket for DreamLoom media assets
#
set -euo pipefail

PROJECT_ID="${1:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${2:-${GOOGLE_CLOUD_REGION:-us-central1}}"

if [ -z "$PROJECT_ID" ]; then
  echo "Usage: ./infra/setup-gcs.sh <PROJECT_ID> [REGION]"
  exit 1
fi

BUCKET_NAME="dreamloom-media-${PROJECT_ID}"

echo "Creating GCS bucket: gs://${BUCKET_NAME}"
gsutil mb -p "${PROJECT_ID}" -l "${REGION}" "gs://${BUCKET_NAME}" 2>/dev/null || echo "Bucket already exists"

echo "Setting public read access..."
gsutil iam ch allUsers:objectViewer "gs://${BUCKET_NAME}"

echo "Setting CORS policy..."
cat > /tmp/cors.json << 'EOF'
[
  {
    "origin": ["*"],
    "method": ["GET"],
    "responseHeader": ["Content-Type"],
    "maxAgeSeconds": 3600
  }
]
EOF
gsutil cors set /tmp/cors.json "gs://${BUCKET_NAME}"
rm /tmp/cors.json

echo "Setting lifecycle (auto-delete after 30 days)..."
cat > /tmp/lifecycle.json << 'EOF'
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {"age": 30}
    }
  ]
}
EOF
gsutil lifecycle set /tmp/lifecycle.json "gs://${BUCKET_NAME}"
rm /tmp/lifecycle.json

echo ""
echo "GCS bucket ready: gs://${BUCKET_NAME}"
echo "Set GCS_BUCKET_NAME=${BUCKET_NAME} in your .env"
