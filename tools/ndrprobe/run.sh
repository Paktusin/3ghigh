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
for f in dbglvl 0 g p ; do
  echo "--- /hbsystem/multicore/navi/$f ---" >> "${OUT}/navi_dbglvl.txt"
  cat "/hbsystem/multicore/navi/$f"          >> "${OUT}/navi_dbglvl.txt" 2>&1
done

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
