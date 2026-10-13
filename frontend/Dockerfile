# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# 必须连 package-lock.json 一起 COPY，npm ci 只认锁文件（只拷 package.json 会报 EUSAGE）
COPY package*.json ./
# 走 npmmirror 国内镜像（npm 10 自动替换锁文件里的 registry 域名，锁文件不用改）；
# cache mount 让依赖层失效时复用下载缓存，不用全量重下
RUN --mount=type=cache,target=/root/.npm npm ci --registry=https://registry.npmmirror.com

COPY . .
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
