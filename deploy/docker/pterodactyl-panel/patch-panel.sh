#!/bin/sh
set -eu

target="/app/app/Models/Server.php"
before="'io' => 'required|numeric|between:10,1000',"
after="'io' => 'required|numeric|between:0,1000',"

if grep -Fq "$before" "$target"; then
  sed -i "s/'io' => 'required|numeric|between:10,1000',/'io' => 'required|numeric|between:0,1000',/" "$target"
fi

grep -Fq "$after" "$target"
