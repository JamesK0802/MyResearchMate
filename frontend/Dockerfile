# Stage 1: Build
FROM node:20 AS build
WORKDIR /app

# Copy VERSION file from project root (for version sync)
COPY VERSION ./VERSION

# Copy frontend source
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .

# prebuild hook in package.json automatically runs sync-version.js
RUN npm run build -- --configuration production

# Stage 2: Serve
FROM nginx:stable-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
