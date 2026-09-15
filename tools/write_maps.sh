#!/bin/zsh
# Записать набор из out/<dir> на SD-карту.
#
# Пишутся те компоненты, которые реально есть в наборе (каталоги pkgdb/* с .conf),
# а не жёстко XAC/XAC3: набор может содержать и GDB/GDB2.
#
#   tools/write_maps.sh cyprus-full [--no-wait]
#   tools/write_maps.sh orig [--no-wait]      — оригинальные компоненты из maps/ (откат)
set -e
cd "$(dirname "$0")/.."
SET="$1"; [ -z "$SET" ] && { echo "укажите набор: out/<dir>, или orig — оригинальный maps/"; exit 1; }
if [ "$SET" = "orig" ]; then D="maps"; else D="out/$SET"; fi
[ -d "$D" ] || { echo "нет каталога $D"; exit 1; }

V="/Volumes/NO NAME"
if [ "$2" != "--no-wait" ]; then
  echo "жду карту $V ..."
  n=0; until [ -d "$V" ] || [ $n -ge 300 ]; do sleep 2; n=$((n+1)); done
fi
[ -d "$V" ] || { echo "карта не смонтирована"; exit 1; }
sleep 2
touch "$V/.w" 2>/dev/null || { echo "карта заблокирована (переключатель LOCK)"; exit 1; }
rm -f "$V/.w"

# Барьер: набор обязан сойтись по всем суммам, включая CheckSum1..N.
node src/checksum.js "$D" 2>&1 | grep -q "все суммы и размеры сходятся" || {
  echo "$D не сходится по суммам — не пишу"; node src/checksum.js "$D" | tail -20; exit 1; }

# какие компоненты есть в наборе
COMPS=()
for d in "$D"/pkgdb/*/; do
  [ -d "$d" ] || continue
  ls "$d"/*.conf >/dev/null 2>&1 || continue
  COMPS+=("$(basename "$d")")
done
echo "компоненты набора: ${COMPS[*]}"

# место: сколько займём и сколько освободим
NEED=$(du -sk "$D" | cut -f1)
FREE=$(df -k "$V" | tail -1 | awk '{print $4}')
HAVE=0
for c in "${COMPS[@]}"; do [ -d "$V/pkgdb/$c" ] && HAVE=$((HAVE + $(du -sk "$V/pkgdb/$c" | cut -f1))); done
echo "нужно $((NEED/1024)) МБ, свободно $((FREE/1024)) МБ, освободится $((HAVE/1024)) МБ"
[ $((FREE + HAVE)) -lt $NEED ] && { echo "не хватит места"; exit 1; }

# снять пробу-скрипты от диагностики, если оставались
rm -f "$V/copie_scr.sh" "$V/run.sh" "$V/uninstall.sh"; rm -rf "$V/scripts" "$V/engdefs" "$V/var/ndr"

# очистить только заменяемые компоненты
for c in "${COMPS[@]}"; do
  [ -d "$V/pkgdb/$c" ] && { echo "чищу $c"; rm -f "$V/pkgdb/$c"/*; }
done

echo "копирую $(du -sh "$D" | cut -f1) ..."
rsync -rt --exclude '.DS_Store' --exclude '._*' "$D/" "$V/" 2>&1 | grep -v "unreadable directory" || true
find "$V" \( -name '._*' -o -name '.DS_Store' \) -delete 2>/dev/null || true

echo "--- сверка карты ---"
node src/checksum.js "$V" 2>&1 | grep -E "Database - |сходятся|РАСХОЖ"
for c in "${COMPS[@]}"; do
  F=$(ls "$D/pkgdb/$c" | grep -v '\.conf$' | head -1)
  [ -n "$F" ] && printf '  %-8s совпал: %s\n' "$c" "$(cmp -s "$D/pkgdb/$c/$F" "$V/pkgdb/$c/$F" && echo да || echo НЕТ)"
done
echo "copie_scr удалён: $([ -f "$V/copie_scr.sh" ] && echo НЕТ || echo да)"
sync
diskutil eject "$V"
