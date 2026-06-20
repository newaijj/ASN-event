#!/usr/bin/env bash
#
# Build the betting app, push it to ECR, and roll it out on the EC2 host.
#
# Setup (one-time):
#   cp deploy.env.example deploy.env
#   # fill in deploy.env with your AWS account/region, EC2 host, SSH key, etc.
#
# Usage:
#   ./deploy.sh              # uses ./deploy.env
#   ./deploy.sh other.env     # uses a different config file
#
# What it does:
#   1. docker build the image locally
#   2. create the ECR repo if it doesn't exist yet, then tag + push
#   3. SSH into the EC2 instance, pull the new image, replace the running
#      container, and prune the old image
#   4. curl the instance to confirm it came back up
#
# Requires locally: docker, aws CLI (configured with push access to ECR), ssh.
# Requires on the EC2 instance: docker, and either an IAM instance role with
# AmazonEC2ContainerRegistryReadOnly, or AWS credentials configured there too.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

ENV_FILE="${1:-deploy.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing config file: $ENV_FILE"
  echo "Copy deploy.env.example to deploy.env and fill in your values first."
  exit 1
fi
# shellcheck disable=SC1090
source "$ENV_FILE"

required_vars=(AWS_REGION AWS_ACCOUNT_ID ECR_REPO EC2_HOST EC2_USER EC2_KEY_PATH HOST_TOKEN)
missing=0
for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "Missing required variable '$v' in $ENV_FILE"
    missing=1
  fi
done
[[ $missing -eq 0 ]] || exit 1

LIQUIDITY_B="${LIQUIDITY_B:-80}"
CONTAINER_NAME="${CONTAINER_NAME:-presentation-betting-app}"
HOST_PORT="${HOST_PORT:-80}"
IMAGE_TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"
# EC2 instances are amd64 unless you specifically picked a Graviton (t4g/m6g/...)
# instance type, which would be arm64. Override in deploy.env if you're on
# Graviton. This matters because Docker defaults to building for whatever
# architecture your local machine is (e.g. arm64 on Apple Silicon Macs), which
# silently produces an image the EC2 host can't run.
TARGET_PLATFORM="${TARGET_PLATFORM:-linux/amd64}"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_URI="${ECR_REGISTRY}/${ECR_REPO}"

echo "==> Building image (${ECR_REPO}:${IMAGE_TAG}) for ${TARGET_PLATFORM}"
docker build --platform "${TARGET_PLATFORM}" -t "${ECR_REPO}:${IMAGE_TAG}" .

echo "==> Logging in to ECR ($ECR_REGISTRY)"
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"

echo "==> Ensuring ECR repo '$ECR_REPO' exists"
aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$ECR_REPO" >/dev/null 2>&1 \
  || aws ecr create-repository --region "$AWS_REGION" --repository-name "$ECR_REPO" >/dev/null

echo "==> Tagging and pushing $ECR_URI:$IMAGE_TAG (and :latest)"
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_URI}:${IMAGE_TAG}"
docker tag "${ECR_REPO}:${IMAGE_TAG}" "${ECR_URI}:latest"
docker push "${ECR_URI}:${IMAGE_TAG}"
docker push "${ECR_URI}:latest"

echo "==> Deploying to ${EC2_USER}@${EC2_HOST}"
ssh -i "$EC2_KEY_PATH" -o StrictHostKeyChecking=accept-new "${EC2_USER}@${EC2_HOST}" bash -s <<EOF
set -euo pipefail
aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$ECR_REGISTRY"
docker pull "${ECR_URI}:${IMAGE_TAG}"
docker stop "${CONTAINER_NAME}" >/dev/null 2>&1 || true
docker rm "${CONTAINER_NAME}" >/dev/null 2>&1 || true
docker run -d \
  --name "${CONTAINER_NAME}" \
  -p ${HOST_PORT}:3000 \
  -e HOST_TOKEN="${HOST_TOKEN}" \
  -e LIQUIDITY_B="${LIQUIDITY_B}" \
  --restart unless-stopped \
  "${ECR_URI}:${IMAGE_TAG}"
docker image prune -f >/dev/null
EOF

echo "==> Health check"
sleep 2
if curl -fsS "http://${EC2_HOST}:${HOST_PORT}/" >/dev/null 2>&1; then
  echo "OK - app is responding at http://${EC2_HOST}:${HOST_PORT}/"
else
  echo "WARNING: no response yet from http://${EC2_HOST}:${HOST_PORT}/ (it may still be starting, or your network/security group blocks you from here)"
fi

echo "==> Done. Image tag deployed: ${IMAGE_TAG}"
