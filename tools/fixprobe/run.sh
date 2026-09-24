#!/bin/ksh
# Починка описателя И снимок журнала за один заход.
#
# Зачем вместе. Установка ЛЮБОГО набора компонентов сносит
# /HBpersistence/navi/db/acios_db.ini и не создаёт его заново — проверено:
# после установки одного XAC описатель пропал, и опыт оказался испорчен
# (logs/2026-09-24-malta-nocoarse). Раздельные карты требовали двух поездок,
# а эта делает всё сама:
#
#   1) кладёт описатель, если его нет (проверив, что все пути существуют);
#   2) поднимает уровень журнала нав-ядра до 1 — тогда его жалобы идут в
#      sloginfo (разобрано по FUN_08e8a0f4, байт пишется ЧИСЛОМ);
#   3) снимает sloginfo и состояние.
#
# Порядок у машины: вставить карту (починит и снимет), перезагрузиться,
# вставить ещё раз (снимет журнал уже с поднятым уровнем).

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/fixprobe"
SRC="${SDPATH}/acios_db.ini"
DST=/HBpersistence/navi/db/acios_db.ini
mkdir -p "${SDPATH}/var" "${OUT}"
echo started > "${SDPATH}/.started"; sync
[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null; chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & SHOWPID=$! ; }
}
L="${OUT}/fix.log"
say() { echo "$@" >> "$L"; sync; }
guard() {
  s=$1; f=$2; shift 2
  ( "$@" > "$f" 2>&1 ; echo "__ЗАВЕРШЕНО__" >> "$f" ; sync ) &
  p=$!; n=0
  while [ $n -lt $s ] ; do kill -0 $p 2>/dev/null || break; sleep 1; n=$((n+1)); done
  kill -9 $p 2>/dev/null; sleep 1
  grep -q "__ЗАВЕРШЕНО__" "$f" 2>/dev/null || echo "__ЗАВИСЛО после ${s}с__" >> "$f"
  sync
}

# ---------- 1. описатель ----------
say "=== состояние до правки ==="
ls -la "$DST" >> "$L" 2>&1
if [ ! -f "$SRC" ]; then say "НЕТ исходника на карте — пропускаю"; else
if [ -f "$DST" ]; then
  say "=== описатель уже есть, не трогаю ==="
  cp "$DST" "${OUT}/acios_db.ini.было" 2>>"$L"
else
  say "=== проверяю пути ==="
  rm -f "${OUT}/.miss"
  sed -n 's/^[A-Za-z][A-Za-z]*: *//p' "$SRC" | while read pth; do
    [ -n "$pth" ] || continue
    if [ -e "$pth" ]; then echo "  есть: $pth" >> "$L"
    else echo "  НЕТ:  $pth" >> "$L"; echo x >> "${OUT}/.miss"; fi
  done
  if [ -f "${OUT}/.miss" ]; then
    say "=== часть путей отсутствует — НИЧЕГО НЕ ПИШУ ==="
  else
    say "=== все пути на месте, кладу описатель ==="
    cp "$SRC" "$DST" >> "$L" 2>&1
    chmod 666 "$DST" >> "$L" 2>&1
    sync
    ls -la "$DST" >> "$L" 2>&1
  fi
fi
fi

# ---------- 2. уровень журнала нав-ядра ----------
LVL=/hbsystem/multicore/navi/dbglvl
( printf '\001' > "$LVL" ) 2>> "${OUT}/dbglvl.txt" &
lp=$!; n=0
while [ $n -lt 5 ] ; do kill -0 $lp 2>/dev/null || break; sleep 1; n=$((n+1)); done
kill -9 $lp 2>/dev/null
echo "записан уровень 1 в $LVL" >> "${OUT}/dbglvl.txt"
sync

# ---------- 3. снимок ----------
sloginfo > "${OUT}/syslog_full.txt" 2>&1
sync
guard 10 "${OUT}/acios_db.txt" sh -c "for f in /HBpersistence/navi/db/acios_db.ini /mnt/lvm/acios_db.ini ; do echo \"=== \$f ===\"; cat \"\$f\" 2>&1; done"
guard 10 "${OUT}/pidin_state.txt" pidin
guard 15 "${OUT}/pkgdb_listing.txt" ls -la /mnt/nav/db/pkgdb/

sync
echo done > "${SDPATH}/.done"
rm -f "${SDPATH}/.started"
[ -n "$SHOWPID" ] && kill $SHOWPID 2>/dev/null
sleep 1
[ -x /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &
sleep 5
