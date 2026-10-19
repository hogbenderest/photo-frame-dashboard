#!/bin/bash
# Install per-frame HA tokens from the clipboard into ~/.config/frame-ha/.
# Run with:  bash ~/photo-frame-dashboard/scripts/install-frame-tokens.sh
# Prompts for each token with hidden input (never in chat or shell history).
set -e
mkdir -p ~/.config/frame-ha

read -s -p "Paste the frame-helen-ian token, then Enter: " TOK
printf '\n%s\n' '{"url":"http://192.168.86.109:8123","token":"'"$TOK"'","frame":"helen_ian"}' > ~/.config/frame-ha/helen_ian.json
echo "  helen_ian.json written ($(wc -c < ~/.config/frame-ha/helen_ian.json) bytes)"

read -s -p "Paste the frame-study token, then Enter: " TOK
printf '\n%s\n' '{"url":"http://192.168.86.109:8123","token":"'"$TOK"'","frame":"study"}' > ~/.config/frame-ha/study.json
echo "  study.json written ($(wc -c < ~/.config/frame-ha/study.json) bytes)"

chmod 600 ~/.config/frame-ha/*.json
echo "Done."
