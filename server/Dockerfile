FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js rooms.js arena.js pvp.js pvp-layout.js ./
USER node
EXPOSE 8080
CMD ["node","index.js"]
