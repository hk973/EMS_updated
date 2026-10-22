#!/bin/bash
set -e

echo "Building with OpenNext Cloudflare adapter..."
npx @opennextjs/cloudflare build --dangerouslyUseUnsupportedNextVersion
