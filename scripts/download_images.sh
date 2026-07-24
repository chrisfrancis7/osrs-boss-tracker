#!/bin/bash
set -e
cd "$(dirname "$0")/.."
mkdir -p assets/bosses
manifest="assets/bosses/manifest.json"
echo "[" > "$manifest"
first=true

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

while IFS=$'\t' read -r name thumb_url; do
  [ -z "$name" ] && continue
  slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed "s/[^a-z0-9]/-/g" | sed 's/-\+/-/g' | sed 's/^-//;s/-$//')
  file="assets/bosses/${slug}.png"

  # Convert thumb URL to full-size image URL: strip "thumb/" and the trailing "NNNpx-Name.png" segment
  full_url=$(echo "$thumb_url" | sed 's#/images/thumb/#/images/#' | sed 's#/[0-9]*px-[^/]*$##')

  echo "Downloading $name -> $file"
  curl -sL --fail \
    -A "$UA" \
    -H "Accept: image/png,image/apng,image/*;q=0.8,*/*;q=0.5" \
    -H "Accept-Language: en-US,en;q=0.9" \
    -H "Referer: https://oldschool.runescape.wiki/w/Boss" \
    "$full_url" -o "$file" || { echo "  FAILED: $name ($full_url)"; continue; }

  # Resize down to max 200px wide to keep file sizes small
  sips -Z 200 "$file" >/dev/null 2>&1 || true

  if [ "$first" = true ]; then
    first=false
  else
    echo "," >> "$manifest"
  fi
  printf '  {"name": "%s", "file": "%s"}' "$name" "${slug}.png" >> "$manifest"
done < scripts/boss_list.tsv

echo "" >> "$manifest"
echo "]" >> "$manifest"
echo "Done."
