FROM node:18.12-bullseye AS appbuild
WORKDIR /home/app
COPY ./ /home/app
RUN npm install
RUN npm run build

FROM node:18.12-bullseye
ENV NODE_ENV=production
COPY ./docker/start-container /usr/local/bin/start-container
RUN chmod +x /usr/local/bin/start-container
WORKDIR /home/app
COPY package.json ./
COPY package-lock.json ./
COPY --from=appbuild /home/app/dist ./dist

RUN npm install
EXPOSE 8080
ENTRYPOINT ["start-container"]
