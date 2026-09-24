#!/bin/ksh
# Где стоит навигация. Порядок важен: сначала всё, что НЕ трогает /mnt/nav
# (на заклиненной машине обращение к нему, включая саму команду mount,
# блокируется), затем объявляем "готово", и лишь в самом конце — рискованные
# чтения nav-раздела в фоне с лимитом. Так экран "готово" появляется всегда.

SDPATH="${1:-${0%/*}}"
OUT="${SDPATH}/var/ndr"
mkdir -p "${SDPATH}/var" "${OUT}"
echo started > "${SDPATH}/.started"
rm -f "${SDPATH}/.done" "${SDPATH}/.syslog"

[ -f "${SDPATH}/bin/showScreen" ] && {
  cp "${SDPATH}/bin/showScreen" /tmp/showScreen 2>/dev/null
  chmod +x /tmp/showScreen 2>/dev/null
  [ -f "${SDPATH}/lib/running.png" ] && { /tmp/showScreen "${SDPATH}/lib/running.png" & SHOWPID=$! ; }
}

# ---------- поднять уровень журнала нав-ядра ----------
#
# Разобрано по коду (`FUN_08e8a0f4`, строка «change NaviBox debug level to %d»):
# уровни 0…3, и байт из файла /hbsystem/multicore/navi/dbglvl передаётся этой
# функции ЧИСЛОМ, а не символом. Уровень 2 (нынешний) отправляет сообщения в
# канал 1, уровень 1 включает канал 0 — тот, что попадает в sloginfo. Значит с
# уровнем 1 жалобы ядра («XAC: …», «no valid acios_db …») станут видны.
#
# Пишется СЫРОЙ байт 0x01. В журнале при следующей загрузке должно появиться
# «change NaviBox debug level to 1» — это и будет подтверждением.
LVL=/hbsystem/multicore/navi/dbglvl
( printf '\001' > "$LVL" ) 2>> "${OUT}/dbglvl_set.txt" &
lp=$!; n=0
while [ $n -lt 5 ] ; do kill -0 $lp 2>/dev/null || break; sleep 1; n=$((n+1)); done
kill -9 $lp 2>/dev/null
echo "записан уровень 1 в $LVL (код $?)" >> "${OUT}/dbglvl_set.txt"
sync

# ---------- безопасное: журнал и процессы (не трогает /mnt/nav) ----------
sloginfo > "${OUT}/syslog_full.txt" 2>&1
sync; echo syslog > "${SDPATH}/.syslog"

pidin                     > "${OUT}/pidin_state.txt"    2>&1
pidin -p ndr              > "${OUT}/pidin_ndr.txt"      2>&1
pidin -p MMI3GApplication > "${OUT}/pidin_mmi3gapp.txt" 2>&1
pidin arg                 > "${OUT}/pidin_arg.txt"      2>&1
for i in 1 2 3 ; do
  echo "===== срез $i =====" >> "${OUT}/pidin_repeat.txt"
  pidin -p ndr >> "${OUT}/pidin_repeat.txt" 2>&1
  sleep 3
done
# Чтение /hbsystem БЛОКИРУЕТСЯ на заклиненной машине: 23 сентября проба умерла
# ровно здесь, не дойдя ни до описателя, ни до .done. Теперь каждое чтение под
# сторожем с лимитом, и снимок доходит до конца в любом случае.
guard() {
  s=$1; f=$2; shift 2
  ( "$@" > "$f" 2>&1 ; echo "__ЗАВЕРШЕНО__" >> "$f" ; sync ) &
  p=$!; n=0
  while [ $n -lt $s ] ; do kill -0 $p 2>/dev/null || break; sleep 1; n=$((n+1)); done
  kill -9 $p 2>/dev/null; sleep 1
  grep -q "__ЗАВЕРШЕНО__" "$f" 2>/dev/null || echo "__ЗАВИСЛО после ${s}с__" >> "$f"
  sync
}
for f in dbglvl 0 g p ; do
  guard 5 "${OUT}/navi_$f.txt" cat "/hbsystem/multicore/navi/$f"
done

# --- описатель базы и нав-персистентность (флеш, не /mnt/nav — безопасно) ---
guard 10 "${OUT}/hbp_navi_listing.txt" ls -laR /HBpersistence/navi
mkdir -p "${OUT}/hbp_navi"
guard 15 "${OUT}/hbp_copy.txt" cp -R /HBpersistence/navi "${OUT}/hbp_navi/"
for f in /HBpersistence/navi/db/acios_db.ini /HBpersistence/navi/acios_db.ini /mnt/lvm/acios_db.ini /mnt/efs-persist/acios_db.ini ; do
  [ -f "$f" ] && { echo "=== $f ===" >> "${OUT}/acios_db.txt"; cat "$f" >> "${OUT}/acios_db.txt"; echo >> "${OUT}/acios_db.txt"; }
done
[ -f "${OUT}/acios_db.txt" ] || echo "acios_db.ini не найден ни по одному пути" > "${OUT}/acios_db.txt"
ls -la /mnt/lvm /mnt/efs-persist 2>&1 | head -40 > "${OUT}/lvm_efspersist_listing.txt"

# --- кэш checkpoints logvolmgr (собран под оригинальную базу) ---
for d in /HBpersistence/lvm /HBpersistence/lvm.checkpoints /HBpersistence/lvm/checkpoints ; do
  echo "=== $d ===" >> "${OUT}/lvm_checkpoints.txt"
  ls -laR "$d" >> "${OUT}/lvm_checkpoints.txt" 2>&1
done
mkdir -p "${OUT}/lvm_copy"
cp -R /HBpersistence/lvm "${OUT}/lvm_copy/" 2>/dev/null

# ---------- ГОТОВО объявляем ЗДЕСЬ, до любых обращений к /mnt/nav ----------
sync
echo done > "${SDPATH}/.done"
rm -f "${SDPATH}/.started"
[ -n "$SHOWPID" ] && kill $SHOWPID 2>/dev/null
sleep 1
[ -x /tmp/showScreen ] && [ -f "${SDPATH}/lib/done.png" ] && /tmp/showScreen "${SDPATH}/lib/done.png" &

# ---------- рискованное: /mnt/nav и mount, в фоне с лимитом 8 с ----------
( mount > "${OUT}/mount.txt" 2>&1
  ls -la /mnt/nav/db/pkgdb/ > "${OUT}/pkgdb_listing.txt" 2>&1
  ls -la /mnt/nav/db/       > "${OUT}/navdb_listing.txt" 2>&1
  cat /mnt/nav/db/config.nfm > "${OUT}/config.nfm"       2>&1
  cat /mnt/nav/db/DBInfo.txt > "${OUT}/DBInfo.txt"       2>&1
  echo ok > "${OUT}/nav_read_ok" ) &
NAVPID=$!
i=0; while [ $i -lt 8 ] && kill -0 $NAVPID 2>/dev/null; do sleep 1; i=$((i+1)); done
kill -0 $NAVPID 2>/dev/null && { echo "чтение /mnt/nav заблокировано (раздел заклинен)" > "${OUT}/nav_read_BLOCKED.txt"; kill $NAVPID 2>/dev/null; }
sync
