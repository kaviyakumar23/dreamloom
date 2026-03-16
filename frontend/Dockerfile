FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Copy source and any .env.production (set by deploy script)
COPY . .
RUN npm run build

# Serve with lightweight static server
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config template — BACKEND_URL is injected at runtime via envsubst
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Default backend URL (overridden by Cloud Run env var)
ENV BACKEND_URL=http://localhost:8000

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
