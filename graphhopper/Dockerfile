FROM eclipse-temurin:21-jre-jammy

ARG GRAPHHOPPER_VERSION=11.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /graphhopper

RUN curl -fL -o graphhopper-web.jar \
    "https://github.com/graphhopper/graphhopper/releases/download/${GRAPHHOPPER_VERSION}/graphhopper-web-${GRAPHHOPPER_VERSION}.jar"

EXPOSE 8989 8990

ENV JAVA_OPTS="-Xmx10g"

# JAVA_OPTS n'est interprété par le shell qu'en forme "shell"/exec via sh -c, ce qui permet de
# régler la heap JVM (-Xmx) via la variable d'env sans écraser les vrais arguments applicatifs
# (server /config/config.yml) passés en CMD/command.
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar graphhopper-web.jar server \"$@\"", "--"]
CMD ["/config/config.yml"]
