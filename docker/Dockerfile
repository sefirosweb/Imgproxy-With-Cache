FROM node:18-bullseye AS appbuild
WORKDIR /home/app
COPY ./ /home/app
RUN npm ci
RUN npm run build

FROM node:18-bullseye
ENV NODE_ENV=production
# Fonts for sharp/SVG text overlays — text renders blank without a system font.
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
COPY ./docker/start-container /usr/local/bin/start-container
RUN chmod +x /usr/local/bin/start-container
WORKDIR /home/app
COPY package.json ./
COPY package-lock.json ./
COPY .npmrc ./
COPY --from=appbuild /home/app/dist ./dist

RUN npm ci --omit=dev
EXPOSE 8080
ENTRYPOINT ["start-container"]
