FROM node:22-alpine

RUN npm install -g bangermap-mcp

ENTRYPOINT ["bangermap-mcp"]
