#!/usr/bin/env bash
set -euo pipefail

# Usage (from server/ with default layout, --root is ../projects):
#   ./set_case_folder_icons.sh --root "../projects" --test-dir "<folder name>"
#   ./set_case_folder_icons.sh --root "../projects" --all
#
# Requirements:
#   - ImageMagick (magick)
#   - fileicon (brew install fileicon)

ROOT=""
TEST_DIR_NAME=""
MODE="test"  # test | all
SKIP_FINDER_RESTART=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)
      ROOT="$2"; shift 2 ;;
    --test-dir)
      TEST_DIR_NAME="$2"; shift 2 ;;
    --all)
      MODE="all"; shift ;;
    --skip-finder-restart)
      SKIP_FINDER_RESTART=1; shift ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$ROOT" ]]; then
  echo "Missing --root" >&2
  exit 1
fi

if [[ ! -d "$ROOT" ]]; then
  echo "Root does not exist: $ROOT" >&2
  exit 1
fi

if ! command -v magick >/dev/null 2>&1; then
  echo "Missing 'magick'. Install ImageMagick first (brew install imagemagick)." >&2
  exit 1
fi

if ! command -v fileicon >/dev/null 2>&1; then
  echo "Missing 'fileicon'. Install first: brew install fileicon" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

FOLDER_BASE="$TMP_DIR/folder_base.png"

find_system_folder_icon() {
  local candidates=(
    "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericFolderIcon.icns"
    "/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/SidebarFolder.icns"
  )
  local c
  for c in "${candidates[@]}"; do
    if [[ -f "$c" ]]; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

SYSTEM_FOLDER_ICON=""
if SYSTEM_FOLDER_ICON="$(find_system_folder_icon)"; then
  # Use real macOS folder icon as base for a native look.
  if command -v sips >/dev/null 2>&1; then
    sips -s format png "$SYSTEM_FOLDER_ICON" --out "$TMP_DIR/folder_base_src.png" >/dev/null
    magick "$TMP_DIR/folder_base_src.png" -resize 1024x1024 "$FOLDER_BASE"
  else
    magick "$SYSTEM_FOLDER_ICON" -resize 1024x1024 "$FOLDER_BASE"
  fi
else
  # Fallback only when system icon is unavailable.
  magick -size 1024x1024 xc:none \
    -fill "#66A9FF" -draw "roundrectangle 80,220 944,900 78,78" \
    -fill "#90C0FF" -draw "roundrectangle 80,140 520,320 64,64" \
    "$FOLDER_BASE"
fi

pick_first_image() {
  local images_dir="$1"
  local candidate

  for ext in jpg jpeg png webp JPG JPEG PNG WEBP; do
    for candidate in "$images_dir"/*."$ext"; do
      if [[ -f "$candidate" ]]; then
        echo "$candidate"
        return 0
      fi
    done
  done
  return 1
}

make_icon_for_case_folder() {
  local case_dir="$1"
  local images_dir="$case_dir/images"

  if [[ ! -d "$images_dir" ]]; then
    echo "[skip] no images dir: $case_dir"
    return 0
  fi

  local first_img
  if ! first_img="$(pick_first_image "$images_dir")"; then
    echo "[skip] no image in: $images_dir"
    return 0
  fi

  local preview="$TMP_DIR/preview.png"
  local front_fill="$TMP_DIR/front_fill.png"
  local front_mask="$TMP_DIR/front_mask.png"
  local front_alpha="$TMP_DIR/front_alpha.png"
  local merged="$TMP_DIR/merged.png"

  magick "$first_img" \
    -auto-orient \
    -resize 1120x748^ \
    -gravity center -extent 1120x748 \
    "$preview"

  # Mask for the visible "front panel" of the folder.
  # Corner radii (as requested):
  # - top-left / top-right: 48
  # - bottom-left / bottom-right: 30
  local x1=57
  local y1=272
  local x2=966
  local y2=872
  local r_tl=48
  local r_tr=48
  local r_bl=30
  local r_br=30

  # Build mask directly on a transparent canvas (avoid SVG transparency quirks).
  magick -size 1024x1024 xc:none -fill white -stroke none \
    -draw "path 'M $((x1 + r_tl)),$y1 H $((x2 - r_tr)) A $r_tr,$r_tr 0 0 1 $x2,$((y1 + r_tr)) V $((y2 - r_br)) A $r_br,$r_br 0 0 1 $((x2 - r_br)),$y2 H $((x1 + r_bl)) A $r_bl,$r_bl 0 0 1 $x1,$((y2 - r_bl)) V $((y1 + r_tl)) A $r_tl,$r_tl 0 0 1 $((x1 + r_tl)),$y1 Z'" \
    PNG32:"$front_mask"
  magick "$front_mask" -alpha extract "$front_alpha"

  # Place image onto transparent canvas, then clip by mask alpha only.
  magick -size 1024x1024 xc:none \
    "$preview" -gravity center -geometry +0+24 -compose over -composite \
    "$front_alpha" -compose CopyOpacity -composite \
    "$front_fill"

  # Put the clipped image under folder highlights/shading from original base.
  magick "$FOLDER_BASE" "$front_fill" -compose over -composite \
    "$merged"

  fileicon set "$case_dir" "$merged"
  echo "[ok] icon set: $case_dir"
}

if [[ "$MODE" == "test" ]]; then
  if [[ -z "$TEST_DIR_NAME" ]]; then
    echo "In test mode, --test-dir is required." >&2
    exit 1
  fi
  TARGET="$ROOT/$TEST_DIR_NAME"
  if [[ ! -d "$TARGET" ]]; then
    echo "Test folder not found: $TARGET" >&2
    exit 1
  fi
  make_icon_for_case_folder "$TARGET"
else
  while IFS= read -r -d '' d; do
    make_icon_for_case_folder "$d"
  done < <(find "$ROOT" -mindepth 1 -maxdepth 1 -type d -print0)
fi

if [[ "$SKIP_FINDER_RESTART" -eq 0 ]]; then
  killall Finder >/dev/null 2>&1 || true
fi

echo "Done."
