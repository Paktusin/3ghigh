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

# Только чтение: ничего на машине не пишется и не запускается.

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
  rm -f "$f.ok"
  ( "$@" > "$f" 2>&1 ; echo "__ЗАВЕРШЕНО__" >> "$f" ; : > "$f.ok" ; sync ) &
  p=$!; n=0
  while [ $n -lt $s ] ; do kill -0 $p 2>/dev/null || break; sleep 1; n=$((n+1)); done
  kill -9 $p 2>/dev/null; sleep 1
  # grep на машине нет — признак завершения отдельным файлом
  [ -f "$f.ok" ] && rm -f "$f.ok" || echo "__ЗАВИСЛО после ${s}с__" >> "$f"
  sync
}
for f in dbglvl 0 g p ; do
  guard 5 "${OUT}/navi_$f.txt" cat "/hbsystem/multicore/navi/$f"
done

# --- следы прошлых загрузок: sloginfo в памяти и после перезагрузки пуст,
#     а дампы падений и времена записи файлов на флеше остаются ---
pidin info > "${OUT}/pidin_info.txt" 2>&1
# кто крутит диск: открытые файлы и набег времени процессора по потокам
pidin -p MMI3GApplication fds > "${OUT}/fds_mmi3gapp.txt" 2>&1
pidin -p ndr fds              > "${OUT}/fds_ndr.txt"     2>&1
# где крутятся потоки: регистры (PC) — пять снимков, чтобы поймать цикл
for i in 1 2 3 4 5 ; do
  echo "===== срез $i =====" >> "${OUT}/regs_mmi3gapp.txt"
  pidin -p MMI3GApplication regs >> "${OUT}/regs_mmi3gapp.txt" 2>&1
  sleep 1
done
for i in 1 2 3 ; do
  echo "===== срез $i =====" >> "${OUT}/times_repeat.txt"
  pidin -p MMI3GApplication times >> "${OUT}/times_repeat.txt" 2>&1
  pidin -p ndr times              >> "${OUT}/times_repeat.txt" 2>&1
  sleep 5
done
guard 15 "${OUT}/hbp_listing.txt" ls -laR /HBpersistence/
# дампы падений (core), архив ошибок и журналы irc (Exception, MAPINFO) — копия
mkdir -p "${OUT}/hbp_syslog"
guard 30 "${OUT}/hbp_syslog_copy.txt" cp -R /HBpersistence/syslog/. "${OUT}/hbp_syslog/"

# --- описатель базы и нав-персистентность (флеш, не /mnt/nav — безопасно) ---
guard 10 "${OUT}/hbp_navi_listing.txt" ls -laR /HBpersistence/navi
mkdir -p "${OUT}/hbp_navi"
guard 15 "${OUT}/hbp_copy.txt" cp -R /HBpersistence/navi "${OUT}/hbp_navi/"
for f in /HBpersistence/navi/db/acios_db.ini /HBpersistence/navi/acios_db.ini /mnt/lvm/acios_db.ini /mnt/efs-persist/acios_db.ini ; do
  [ -f "$f" ] && { echo "=== $f ===" >> "${OUT}/acios_db.txt"; cat "$f" >> "${OUT}/acios_db.txt"; echo >> "${OUT}/acios_db.txt"; }
done
[ -f "${OUT}/acios_db.txt" ] || echo "acios_db.ini не найден ни по одному пути" > "${OUT}/acios_db.txt"
ls -la /mnt/lvm /mnt/efs-persist 2>&1 | head -40 > "${OUT}/lvm_efspersist_listing.txt"
# описатель, который собирает сам logvolmgr (виртуальный файл)
guard 10 "${OUT}/dev_lvm.txt" ls -la /dev/lvm
guard 10 "${OUT}/dev_lvm_acios.txt" cat /dev/lvm/acios_db.ini

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
  cat /mnt/nav/db/pkgdb/*.pkg > "${OUT}/installed_pkg.txt" 2>&1
  ls -laR /mnt/nav/db/pkgdb > "${OUT}/pkgdb_tree.txt" 2>&1
  echo ok > "${OUT}/nav_read_ok" ) &
NAVPID=$!
i=0; while [ $i -lt 8 ] && kill -0 $NAVPID 2>/dev/null; do sleep 1; i=$((i+1)); done
kill -0 $NAVPID 2>/dev/null && { echo "чтение /mnt/nav заблокировано (раздел заклинен)" > "${OUT}/nav_read_BLOCKED.txt"; kill $NAVPID 2>/dev/null; }
sync
