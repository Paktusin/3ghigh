#!/bin/zsh
# Положить пробу ndr на SD-карту рядом с набором карт (набор не трогается).
#   tools/write_probe.sh            — ждёт карту до 10 минут, пишет, извлекает
#   tools/write_probe.sh --no-wait  — карта уже вставлена
set -e
cd "$(dirname "$0")/.."
V="/Volumes/NO NAME"
if [ "$1" != "--no-wait" ]; then
  n=0; until [ -d "$V" ] || [ $n -ge 300 ]; do sleep 2; n=$((n+1)); done
fi
[ -d "$V" ] || { echo "карта не смонтирована"; exit 1; }
sleep 2
touch "$V/.w" 2>/dev/null || { echo "карта заблокирована (LOCK) — сдвиньте ползунок"; exit 1; }
rm -f "$V/.w"
rm -rf "$V/var/ndr" "$V/.started" "$V/.done" "$V/.syslog"
# Источник пробы — tools/ndrprobe/run.sh (out/ — производное и может быть пустым)
cp tools/ndrprobe/run.sh "$V/run.sh"
cp out/ndrprobe/copie_scr.sh "$V/copie_scr.sh"
ditto --norsrc --noextattr --noacl out/ndrprobe/bin "$V/bin"
ditto --norsrc --noextattr --noacl out/ndrprobe/lib "$V/lib"
mkdir -p "$V/var"
find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true
echo "run.sh: sloginfo на строке $(grep -n '^sloginfo' "$V/run.sh" | cut -d: -f1) (должна быть в начале)"
echo "copie_scr: $([ -f "$V/copie_scr.sh" ] && echo да || echo нет); набор Кипра на месте: $([ -s "$V/pkgdb/XAC/kN221EUx01_0.db" ] && echo да || echo НЕТ)"
sync
diskutil eject "$V"
