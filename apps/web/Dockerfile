FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npx vite build

FROM busybox:1.36 AS final
WORKDIR /app
COPY --from=build /app/dist ./dist
CMD ["sh", "-c", "cp -r /app/dist/. /out/ && echo 'web: dist copied'"]
