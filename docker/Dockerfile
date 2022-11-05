FROM node:18.12-bullseye

WORKDIR /home/app

COPY ./docker/start-container /usr/local/bin/start-container
RUN chmod +x /usr/local/bin/start-container

COPY ./ /home/app

RUN su node
RUN npm install
RUN npm run build

EXPOSE 8080

ENTRYPOINT ["start-container"]

