FROM mcr.microsoft.com/playwright:v1.62.1-noble

ARG WHALE_DEB_URL=https://installer-whale.pstatic.net/downloads/installers/naver-whale-stable_amd64.deb

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npx playwright-core install msedge \
    && curl --fail --show-error --location "$WHALE_DEB_URL" --output /tmp/whale.deb \
    && apt-get update \
    && apt-get install --yes --no-install-recommends /tmp/whale.deb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/whale.deb

COPY --chown=pwuser:pwuser src ./src

ENV NODE_ENV=production \
    PORT=8788 \
    HOME=/home/pwuser \
    XDG_CACHE_HOME=/home/pwuser/.cache \
    XDG_CONFIG_HOME=/home/pwuser/.config \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    EDGE_PATH=/opt/microsoft/msedge/msedge \
    WHALE_PATH=/opt/naver/whale/whale

USER pwuser

EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const{readFileSync}=require('node:fs');const t=process.env.RUNNER_API_TOKEN_FILE?readFileSync(process.env.RUNNER_API_TOKEN_FILE,'utf8').trim():process.env.RUNNER_API_TOKEN;fetch('http://127.0.0.1:8788/health',{headers:{authorization:'Bearer '+t}}).then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server.mjs"]
