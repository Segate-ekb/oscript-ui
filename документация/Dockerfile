# Образ сайта документации oscript-ui. Контекст сборки — корень репозитория кита:
# сайт подключает кит из рабочего дерева (#Использовать ".."), поэтому в образ едут
# и кит (lib.config, src), и каталог документации с уже поставленными зависимостями.
#
#   docker buildx build --platform linux/amd64 -f документация/Dockerfile \
#     -t harbor.1cdevelopers.ru/library/oscript-ui-docs:<версия> --push .

ARG ONESCRIPT_IMAGE=evilbeaver/onescript:2.2.1
FROM ${ONESCRIPT_IMAGE}

# Унаследованные от базы ASP.NET порт и пользователь гасятся: порт задаёт winow.
ENV ASPNETCORE_HTTP_PORTS= \
    APP_UID= \
    TZ=UTC

RUN set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends curl; \
    rm -rf /var/lib/apt/lists/*; \
    groupadd --gid 10001 docs; \
    useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin docs

WORKDIR /app
COPY lib.config packagedef LICENSE ./
COPY src ./src
COPY документация ./документация

WORKDIR /app/документация
USER 10001:10001
EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD curl -fsS http://localhost:3333/ || exit 1

ENTRYPOINT ["oscript", "/app/документация/main.os", "--порт", "3333"]
