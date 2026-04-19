#!/bin/sh
set -eu

target="/app/app/Models/Server.php"
before="'io' => 'required|numeric|between:10,1000',"
after="'io' => 'required|numeric|between:0,1000',"
admin_layout="/app/resources/views/layouts/admin.blade.php"
base_layout="/app/resources/views/layouts/base.blade.php"
script_tag='<script src="/ko-patch.js"></script>'

if grep -Fq "$before" "$target"; then
  sed -i "s/'io' => 'required|numeric|between:10,1000',/'io' => 'required|numeric|between:0,1000',/" "$target"
fi

grep -Fq "$after" "$target"

for layout in "$admin_layout" "$base_layout"; do
  if [ -f "$layout" ] && ! grep -Fq "$script_tag" "$layout"; then
    sed -i "s#</body>#    $script_tag\n</body>#g" "$layout"
  fi
done
