FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN NODE_ENV=development npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
RUN npm prune --omit=dev

RUN mkdir -p /app/data
RUN addgroup --system app && adduser --system --ingroup app app
RUN chown -R app:app /app/data
USER app

VOLUME /app/data
EXPOSE 3000

CMD ["node", "dist/index.js"]
