FROM mcr.microsoft.com/playwright:v1.61.0-noble

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

# Install deps first (layer cache)
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Copy source
COPY . .

# The worker also serves the remote-login WebSocket (see worker/connect-service.ts),
# so it must be deployed as a web service with a public HTTPS URL, not a
# background worker. Hosts that inject PORT override this default.
ENV WORKER_HTTP_PORT=8080
EXPOSE 8080

# Worker entrypoint (same as npm run worker)
CMD ["npm", "run", "worker"]
