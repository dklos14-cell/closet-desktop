#!/bin/sh
# Packs the installers from release/ with their "READ ME FIRST" guides into two zips to send:
#   release/Closet for Mac.zip       release/Closet for Windows.zip
# Run after `npm run dist`.
set -e
cd "$(dirname "$0")/.."
version=$(node -p "require('./package.json').version")
rm -f "release/Closet for Mac.zip" "release/Closet for Windows.zip"
zip -j "release/Closet for Mac.zip" "release/Closet-$version-universal.dmg" "share/READ ME FIRST - Mac.txt"
zip -j "release/Closet for Windows.zip" "release/Closet Setup $version.exe" "share/READ ME FIRST - Windows.txt"
ls -lh release/*.zip
