# Imgproxy-With-Cache

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/sefirosweb)

Project based on [Imgproxy](https://github.com/imgproxy/imgproxy) for serving a static files, these files can be resized and optimized by url request

The idea is to have a image media server, and server to provide different images sizes, also they can cached the images has been resized for optimize the performance

To upload the image files you must provide it manually (via ftp or own development)

Example:

https://yourdomain.com/path/image.jpg?width=300&height=168resizing_type=fit&extend=1&enlarge=1&background_rgb=FFFFFF&format=webp&quality=25

This example is resized to 300 x 168 (ratio 16x9) + converted to webp + reduced quality + added background white if original image don't have same ratio

- In the case that you provide information in the url query with `?` the program will optimize the image according to the data sent and will automatically cache the image in the .cache folder, so the next request will not have to process it

- In the event that you do not provide data in the query, it will send the original size directly

![image](https://raw.githubusercontent.com/sefirosweb/Imgproxy-With-Cache/master/docs/how_to.gif)

## Parameters

A bunch of parameters are based from original program [Imgproxy](https://docs.imgproxy.net/generating_the_url) and not all parameters are included in this program

Current parameters included:

- format `png | jpg | webp | avif | gif | ico | bmp | tiff` | `default: jpg`
- resizing_type `fit | fill | fill-down | force | auto` | `default: fit`
- width
- height `defaut: Is is not setted the image is preserve the original ratio`
- quality `default: 75`
- enlarge `default: 0`
- extend `default: 0`
- background_rgb `default: FFFFFF`

## Deploy to production

**Docker is required** because Imgproxy are used via docker to compress the files

1. Copy example docker compose: `curl -o docker-compose.yml https://raw.githubusercontent.com/sefirosweb/Imgproxy-With-Cache/master/production/docker-compose.yml`
2. Create and edit `.env` file, you need to set the port and app_url
3. Start docker compose: `docker-compose -up -d`

## Develop

**Docker is required** because Imgproxy are used via docker to compress the files

1. Create and edit .env file, you need to set the port and app_url
2. Start containers: `docker-compose up -d`
3. Login to node container: `docker-compose exec -u node app_imgproxy bash`
4. Install dependencies: `npm install`
5. Start development: `npm run dev`
6. On finish test the build operation: `npm run build`
7. Start server: `npm start`

You can debug with vscode, default port to listen: 9229

### Upload to docker

1. docker build -f docker/Dockerfile -t sefirosweb/imgproxywithcache:latest .
2. docker tag sefirosweb/imgproxywithcache:latest sefirosweb/imgproxywithcache:1.0.0
3. docker push sefirosweb/imgproxywithcache:latest

### TODOS

- Add batch to compress and cache the files
- Add search input to find the images or folder
- Improve to Vue instead EJS
