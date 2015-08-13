####
# Dockerfile for ContainerShip Cloud Loadbalancer
####

FROM haproxy:1.5.14

MAINTAINER ContainerShip Developers <developers@containership.io>

RUN mkdir /app
WORKDIR /app
RUN apt-get update && apt-get install -y curl git
RUN curl --silent --location https://deb.nodesource.com/setup_0.12 | bash -
RUN apt-get install --yes nodejs
RUN curl https://www.npmjs.com/install.sh | sh
RUN npm install n -g
RUN n 0.10.38
ADD . /app
RUN npm install
CMD node loadbalancer
