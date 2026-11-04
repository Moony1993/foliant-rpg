# Foliant: one container serves the API and the SPA (like the Azure deployment). Data lives in /data.
FROM node:22-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api
# Built for Linux only (x64 or arm64, from the build platform): keeps Windows-only native files out of the image.
ARG TARGETARCH
WORKDIR /src
COPY backend/Foliant.Api.csproj backend/
RUN dotnet restore backend/Foliant.Api.csproj -r linux-$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64)
COPY backend/ backend/
COPY rule-packages/ rule-packages/
COPY --from=web /src/frontend/dist/ backend/wwwroot/
RUN dotnet publish backend/Foliant.Api.csproj -c Release -o /out --no-restore --self-contained false \
    -r linux-$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64)

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=api /out ./
# Database and push keys in /data, uploads in wwwroot/uploads: both are volumes (see docker-compose.yml).
RUN mkdir -p /data wwwroot/uploads && chown -R $APP_UID /data wwwroot/uploads
USER $APP_UID
ENV ConnectionStrings__Default="Data Source=/data/foliant.db" \
    Push__KeyFile=/data/vapid-keys.json
EXPOSE 8080
ENTRYPOINT ["dotnet", "Foliant.Api.dll"]
