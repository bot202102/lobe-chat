FROM mcr.microsoft.com/devcontainers/typescript-node:1-20-bullseye

# Install additional tools
RUN apt-get update && apt-get install -y \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install global packages
RUN npm install -g pnpm

# Set working directory
WORKDIR /workspace

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
COPY packages ./packages

# Install dependencies
RUN pnpm install

# Set up development environment
ENV NODE_ENV=development
ENV NEXT_PUBLIC_SERVICE_MODE=server