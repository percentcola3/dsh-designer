#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
resources=${DSH_APP_RESOURCES:-'/Applications/DeepSeek Harness.app/Contents/Resources'}
electron="$resources/../MacOS/DeepSeek Harness"
if [ ! -x "$electron" ]; then
  printf '%s\n' 'DeepSeek Harness Desktop was not found. Set DSH_APP_RESOURCES to its Contents/Resources directory.' >&2
  exit 1
fi
exec env ELECTRON_RUN_AS_NODE=1 "$electron" --expose-internals "$script_dir/designer-debug.mjs" "$@"
