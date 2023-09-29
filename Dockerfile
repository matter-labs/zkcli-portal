FROM ubuntu:latest
ARG VERSION
ARG NODE_TYPE

WORKDIR /app

# Update and install necessary packages
RUN apt-get update \
  && apt-get install -y curl jq unzip apache2 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

RUN echo "Portal ${VERSION}: ${NODE_TYPE}"

# Download the release version specified by the build argument
RUN curl -s "https://api.github.com/repos/matter-labs/dapp-portal/releases/tags/${VERSION}" | \
  jq -r --arg NODE_TYPE "$NODE_TYPE" '.assets[] | select(.name == "dist-node-"+$NODE_TYPE+".zip") | .browser_download_url' | \
  head -n 1 | xargs -I {} curl -L -o dist.zip {}

# Unpack the zip archive
# The archive contains a single directory with the name of the release
# Move the contents of the directory to the Apache2 root directory
RUN mkdir -p /tmp/unzip-temp \
  && unzip dist.zip -d /tmp/unzip-temp/ \
  && FIRST_DIR=$(find /tmp/unzip-temp/ -mindepth 1 -maxdepth 1 -type d | head -n 1) \
  && mv $FIRST_DIR/* /var/www/html/ \
  && rm -rf /tmp/unzip-temp

# Configure Apache to serve on port 3000
RUN sed -i 's/Listen 80/Listen 3000/' /etc/apache2/ports.conf

# Expose the port 3000 for the service
EXPOSE 3000

# Start Apache2 in the foreground
CMD ["apachectl", "-D", "FOREGROUND"]