#!/bin/ksh
# Восстановить описатель базы /HBpersistence/navi/db/acios_db.ini.
#
# Зачем. После ЧАСТИЧНОЙ установки (несколько компонентов вместо всех) LVM не
# создаёт этот файл заново, и он пропадает. Без него CDM не находит ни одной
# базы, каталог навигационного тома пуст, NDL не получает итератор и молча
# ждёт вечно — полоса встаёт на 28%. Сверено с исправной машиной: там файл
# есть (923 байта, 17 записей), здесь его нет, а состав раздела одинаковый.
#
# Содержимое берём побайтно с исправной машины. Пути в нём не зависят от того,
# что мы правили: они указывают на компоненты раздела, а те на месте.
#
# Скрипт пишет ровно один файл и только если ВСЕ пути из него существуют.

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/fix"
SRC="${SDPATH}/acios_db.ini"
DST=/HBpersistence/navi/db/acios_db.ini
mkdir -p "${SDPATH}/var" "${OUT}"
echo started > "${SDPATH}/.started"; sync
[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null; chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & }
}

L="${OUT}/fix.log"
say() { echo "$@" >> "$L"; sync; }

say "=== состояние до правки ==="
ls -la "$DST" >> "$L" 2>&1
ls -la /HBpersistence/navi/db >> "$L" 2>&1
ls -la /HBpersistence/navi/nobss >> "$L" 2>&1

if [ ! -f "$SRC" ]; then say "НЕТ исходника $SRC на карте — выхожу"; else

if [ -f "$DST" ]; then
  say "=== файл уже есть, сохраняю копию и НЕ трогаю ==="
  cp "$DST" "${OUT}/acios_db.ini.было" 2>>"$L"
else
  say "=== проверяю, что все пути из описателя существуют ==="
  rm -f "${OUT}/.miss"
  miss=0
  sed -n 's/^[A-Za-z][A-Za-z]*: *//p' "$SRC" | while read pth; do
    [ -n "$pth" ] || continue
    if [ -e "$pth" ]; then echo "  есть: $pth" >> "$L"
    else echo "  НЕТ:  $pth" >> "$L"; echo x >> "${OUT}/.miss"; fi
  done
  [ -f "${OUT}/.miss" ] && miss=1
  if [ "$miss" = "1" ]; then
    say "=== часть путей отсутствует — НИЧЕГО НЕ ПИШУ ==="
  else
    say "=== все пути на месте, кладу описатель ==="
    cp "$SRC" "$DST" >> "$L" 2>&1
    chmod 666 "$DST" >> "$L" 2>&1
    sync
    say "=== состояние после правки ==="
    ls -la "$DST" >> "$L" 2>&1
    say "--- содержимое записанного ---"
    cat "$DST" >> "$L" 2>&1
  fi
fi
fi
sync

# --- уровень журнала нав-ядра: 1 включает канал, видимый в sloginfo ---
# Разобрано по FUN_08e8a0f4 («change NaviBox debug level to %d»): уровни 0..3,
# и байт из файла передаётся ЧИСЛОМ, а не символом.
( printf '\001' > /hbsystem/multicore/navi/dbglvl ) 2>> "${OUT}/dbglvl.txt"
echo "уровень 1 записан" >> "${OUT}/dbglvl.txt"

# --- снимок журнала: он же и ответ, поднялась ли навигация ---
sloginfo > "${OUT}/syslog_full.txt" 2>&1
sync
cp "$L" "${OUT}/fix_copy.log" 2>/dev/null
echo done > "${SDPATH}/.done"; sync
[ -f /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &
sleep 5
