#!/usr/bin/env bash
# DreamLoom — one-command local setup and run
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}DreamLoom — Starting local development environment${NC}"

# Check for .env
if [ ! -f "$ROOT_DIR/.env" ]; then
  if [ -f "$ROOT_DIR/.env.example" ]; then
    echo -e "${GREEN}Creating .env from .env.example — please edit with your API keys${NC}"
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  else
    echo "ERROR: No .env or .env.example found. Create a .env file with GOOGLE_API_KEY."
    exit 1
  fi
fi

# Backend setup
echo -e "${BLUE}Setting up backend...${NC}"
cd "$ROOT_DIR/backend"

if [ ! -d "$ROOT_DIR/.venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv "$ROOT_DIR/.venv"
fi

source "$ROOT_DIR/.venv/bin/activate"
pip install -q -r requirements.txt

# Frontend setup
echo -e "${BLUE}Setting up frontend...${NC}"
cd "$ROOT_DIR/frontend"
npm install --silent

# Start both services
echo -e "${GREEN}Starting DreamLoom...${NC}"
echo -e "  Backend:  http://localhost:8000"
echo -e "  Frontend: http://localhost:5173"
echo -e "  Health:   http://localhost:8000/health"
echo ""

# Trap SIGINT to clean up both processes
cleanup() {
  echo -e "\n${BLUE}Shutting down DreamLoom...${NC}"
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  echo -e "${GREEN}Done.${NC}"
}
trap cleanup SIGINT SIGTERM

# Start backend
cd "$ROOT_DIR"
source "$ROOT_DIR/.venv/bin/activate"
uvicorn backend.main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$ROOT_DIR/frontend"
npm run dev &
FRONTEND_PID=$!

# Wait for either to exit
wait $BACKEND_PID $FRONTEND_PID
