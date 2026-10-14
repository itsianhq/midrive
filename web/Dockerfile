# Output is static files, so build natively even for multi-arch images
FROM --platform=$BUILDPLATFORM oven/bun:1.4.2 AS build

WORKDIR /app

COPY package.json bun.lock ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=build /app/dist /usr/share/nginx/html

# Public URL of the API as seen by browsers, written to config.js on start
ARG API_URL
ENV API_URL=$API_URL

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
