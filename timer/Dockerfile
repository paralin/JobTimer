FROM node:5.9-onbuild
RUN wget -O /usr/local/bin/dumb-init https://github.com/Yelp/dumb-init/releases/download/v1.0.0/dumb-init_1.0.0_amd64 \
    && chmod +x /usr/local/bin/dumb-init
CMD ["/usr/local/bin/dumb-init", "npm", "start"]
