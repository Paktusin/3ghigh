#!/bin/zsh
# Положить эталонную пробу (рабочая навигация) на карту. Ничего, кроме файлов
# пробы, не трогает — набор карт, если он есть, остаётся на месте.
# Снимать при ОБЫЧНОЙ работе машины: вставить карту, не заходя в меню обновления.
set -e
cd "$(dirname "$0")/.."
V="/Volumes/NO NAME"
if [ "$1" != "--no-wait" ]; then
  echo "жду карту $V ..."
  n=0; until [ -d "$V" ] || [ $n -ge 300 ]; do sleep 2; n=$((n+1)); done
fi
[ -d "$V" ] || { echo "карта не смонтирована"; exit 1; }
sleep 2
touch "$V/.w" 2>/dev/null || { echo "карта заблокирована (LOCK)"; exit 1; }
rm -f "$V/.w"
setopt +o nomatch 2>/dev/null || true
rm -rf "$V/var/base" "$V/var/nav" "$V/var/ndr" 2>/dev/null || true
rm -f "$V/.started" "$V/.done" 2>/dev/null || true
find "$V" -maxdepth 1 -name ".step*" -delete 2>/dev/null || true
cp tools/baseline/run.sh "$V/run.sh"
cp out/ndrprobe/copie_scr.sh "$V/copie_scr.sh"
ditto --norsrc --noextattr --noacl out/ndrprobe/bin "$V/bin"
ditto --norsrc --noextattr --noacl out/ndrprobe/lib "$V/lib"
mkdir -p "$V/var"
find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true
echo "--- итог ---"
echo "run.sh: $([ -f "$V/run.sh" ] && echo да || echo НЕТ)   copie_scr: $([ -f "$V/copie_scr.sh" ] && echo да || echo НЕТ)"
echo "набор на карте (если был): $([ -d "$V/pkgdb" ] && echo есть || echo нет) — не тронут"
sync; diskutil eject "$V"
