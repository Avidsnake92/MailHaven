FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:20-alpine
WORKDIR /app

# Install ClamAV
RUN apk add --no-cache clamav clamav-daemon clamav-libunrar && \
    mkdir -p /var/lib/clamav /run/clamav && \
    chown -R clamav:clamav /var/lib/clamav /run/clamav

# Copy production node_modules and source
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./

# Startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3001
CMD ["/docker-entrypoint.sh"]
