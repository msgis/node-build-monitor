FROM node:14-alpine

RUN apk add --no-cache tini

WORKDIR /build-mon

ADD package.json /build-mon/package.json
RUN npm install

ADD app /build-mon/app
ADD README.md /build-mon/README.md

ONBUILD ADD config.json /build-mon/app/config.json

EXPOSE 3000

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD [ "/sbin/tini", "node", "/build-mon/app/app.js" ]
