####
# Dockerfile for ContainerShip Cloud Loadbalancer
####

FROM ubuntu:14.04

MAINTAINER ContainerShip Developers <developers@containership.io>

RUN mkdir /app
WORKDIR /app
RUN apt-get update && apt-get install -y curl git npm
RUN npm install n -g
RUN n 0.10.38
ADD . /app
RUN npm install
CMD node loadbalancer
