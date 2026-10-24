#!/bin/bash
# Install per-frame HA tokens into ~/.config/frame-ha/ (hidden input; tokens
# never land in chat or shell history).
# Run with:  bash ~/photo-frame-dashboard/scripts/install-frame-tokens.sh [frame]
#   no argument  -> prompt for every frame below (original behaviour)
#   <frame> name -> prompt ONLY for that frame; other files untouched
# living.json predates this script and is hand-maintained: never prompted for.
set -e
mkdir -p ~/.config/frame-ha

ONLY="$1"
for F in helen_ian study alexa; do
  if [ -n "$ONLY" ] && [ "$F" != "$ONLY" ]; then continue; fi
  read -s -p "Paste the frame-$F token, then Enter: " TOK
  printf '\n%s\n' '{"url":"http://192.168.86.109:8123","token":"'"$TOK"'","frame":"'"$F"'"}' > ~/.config/frame-ha/$F.json
  echo "  $F.json written ($(wc -c < ~/.config/frame-ha/$F.json) bytes)"
done

chmod 600 ~/.config/frame-ha/*.json
echo "Done."
