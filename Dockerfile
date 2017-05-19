FROM nginx:1.11.1

MAINTAINER Containership Developers <developers@containership.io>

# install system dependencies
RUN echo "deb http://ftp.us.debian.org/debian wheezy-backports main" >> /etc/apt/sources.list
RUN apt-get update && apt-get install apt-transport-https curl -y
RUN curl -sL https://deb.nodesource.com/setup_6.x | bash -
RUN curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | apt-key add -
RUN echo "deb https://dl.yarnpkg.com/debian/ stable main" >> /etc/apt/sources.list.d/yarn.list
RUN apt-get update && apt-get install nodejs yarn -y

# initialize directories
RUN rm -rf /etc/nginx/*
RUN mkdir /etc/nginx/tcp.d
RUN mkdir /etc/nginx/http.d
RUN mkdir /etc/nginx/https.d
RUN mkdir /etc/nginx/ssl
RUN mkdir /app
RUN mkdir /app/basic_auth

# add code
ADD . /app
WORKDIR /app

# install application dependencies
RUN yarn install
CMD node index.js
