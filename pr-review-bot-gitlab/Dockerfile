FROM --platform=linux/amd64 node:20-alpine3.17
RUN apk add --no-cache git
RUN mkdir -p /usr/app
WORKDIR /usr/app
ENV NODE_OPTIONS=--max_old_space_size=16384
EXPOSE 3000
COPY package.json .
RUN npm i --quiet
COPY . .
CMD ["npm", "start"]
