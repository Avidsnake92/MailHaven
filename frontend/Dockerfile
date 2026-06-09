FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Usa npm ci con fallback prefer-offline per ambienti senza accesso a npm registry
RUN npm ci --prefer-offline 2>/dev/null || npm ci
# Assicura che vite sia eseguibile (workaround per cache Docker corrotta)
RUN test -f node_modules/.bin/vite || npm install vite --no-save
COPY . .
RUN ./node_modules/.bin/vite build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

