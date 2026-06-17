FROM mcr.microsoft.com/playwright:v1.61.0-noble

WORKDIR /app

ENV NODE_ENV=production

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy source
COPY . .

# Worker entrypoint (same as npm run worker)
CMD ["npm", "run", "worker"]
