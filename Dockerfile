FROM ubuntu:latest

RUN apt-get update && apt-get install -y nginx-full && apt-get install -y npm && apt-get install -y curl && npm install -g n && n 6.7.0

ADD . /app
WORKDIR /app
CMD node index.js


