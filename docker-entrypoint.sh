#!/bin/sh
# Runs as root (the image's default user) so it can fix ownership of the
# database directory before handing off to the unprivileged `node` user.
#
# This matters specifically for managed platforms (Render, Railway, Fly, etc.)
# that attach a persistent disk at container *start* time, after the image
# was built -- the mount arrives owned by root regardless of anything the
# Dockerfile chowned at build time, so a plain `USER node` set once in the
# Dockerfile is not enough.
set -e

if [ "$DATABASE_PATH" != ":memory:" ]; then
  DB_DIR=$(dirname "$DATABASE_PATH")
  if [ "$DB_DIR" != "." ] && [ "$DB_DIR" != "/app" ]; then
    mkdir -p "$DB_DIR"
    chown -R node:node "$DB_DIR"
  fi
fi

exec gosu node "$@"
