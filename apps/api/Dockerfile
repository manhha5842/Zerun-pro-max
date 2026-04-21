FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web-admin/package.json apps/web-admin/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/adapters/package.json packages/adapters/package.json
COPY packages/worker-core/package.json packages/worker-core/package.json

RUN npm install

COPY . .
RUN npm run prisma:generate && npm run build

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@zerun/api"]
