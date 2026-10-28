#!/bin/zsh

cd -- "$(dirname "$0")"
echo "FIELD / 01 · LAN SHARE"
echo "Keep this window open while others are visiting."
echo
FIELD_HOST=0.0.0.0 exec python3 server.py
