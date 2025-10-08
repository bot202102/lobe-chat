#!/bin/bash
set -e

echo "🔧 Setting permissions..."
sudo chown -R node:node /workspace/node_modules /workspace/.next || true

echo "📦 Configuring pnpm..."
pnpm -v
pnpm config set store-dir ~/.pnpm-store
pnpm config set node-linker hoisted
pnpm config set package-import-method copy

echo "📥 Installing dependencies..."
HUSKY=0 pnpm install --recursive --frozen-lockfile --prefer-offline --shamefully-hoist --force

echo "⏳ Waiting for PostgreSQL to be ready..."
MAX_RETRIES=30
RETRY_COUNT=0

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if PGPASSWORD=uWNZugjBqixf8dxC psql -h postgresql -U postgres -d lobechat -c "SELECT 1" >/dev/null 2>&1; then
    echo "✅ PostgreSQL is ready!"
    break
  fi
  
  echo "⏳ Waiting for PostgreSQL... (attempt $((RETRY_COUNT+1))/$MAX_RETRIES)"
  RETRY_COUNT=$((RETRY_COUNT+1))
  sleep 2
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
  echo "❌ PostgreSQL is not available after $MAX_RETRIES attempts"
  echo "💡 Suggestion: Run 'docker compose -f .devcontainer/docker-compose.yml down -v' and rebuild"
  exit 1
fi

echo "🗄️  Running database migrations..."
pnpm db:migrate

echo "✅ Setup complete!"

