#!/bin/ksh

#remount SD as rw
DRVS="sd0 sd1"
for i in $DRVS ; do
   if [ -d /fs/$i ] ; then
    if [ -e /fs/$i/upd ] ; then
     mount -u /fs/$i
	 mount -u /fs/$i
     SDCARD=/fs/$i
     echo remount $SDCARD
	 export LD_LIBRARY_PATH=$LD_LIBRARY_PATH:$SDCARD/utils
	fi
   fi
done

runtstamp=`date +"%m/%d/%Y ""%T"`

$SDCARD/utils/showScreen $SDCARD/screens/scriptStart.png
cd $SDCARD
/bin/mount -uw /mnt/efs-system
if test -a /sbin/mme-becker.sh ; then
  # check if second install
  XX=`/usr/bin/grep acios_db.ini /sbin/mme-becker.sh`
  if [ ! -z "$XX" ]
  then
    # already installed - uninstall first!
	$SDCARD/utils/showScreen $SDCARD/screens/error1.png
    /bin/rm -f /tmp/copie_scr.sh
    echo > /tmp/copie_scr.sh
    exit 0
  fi
  # backup mme-becker.sh for later uninstall
  /bin/cp /sbin/mme-becker.sh /sbin/mme-becker.sh.pre-navdb.bak
  # remove mme-becker launch line
  $SDCARD/utils/sed "/\/sbin\/mme-becker/ d" < /sbin/mme-becker.sh > /sbin/mme-becker.sh.new
  /bin/mv /sbin/mme-becker.sh.new /sbin/mme-becker.sh
  cat << 'EOF' > /sbin/mme-becker.sh
#!/bin/ksh

(waitfor /mnt/lvm/acios_db.ini 180 && sleep 10 && slay vdev-logvolmgr) &

/sbin/mme-becker $@
EOF
chmod 777 /sbin/mme-becker.sh
else
  # first install
  $SDCARD/utils/sed "s/\/mme-becker$/\/mme-becker.sh/" < /etc/mmelauncher.cfg > /etc/mmelauncher.cfg.new
  if ! test -a /etc/mmelauncher.cfg.orig ; then
    # just keep original version - so just do this the first time
    /bin/mv /etc/mmelauncher.cfg /etc/mmelauncher.cfg.pre-navdb.bak
  fi
  /bin/mv /etc/mmelauncher.cfg.new /etc/mmelauncher.cfg
  cat << 'EOF' > /sbin/mme-becker.sh
#!/bin/ksh

(waitfor /mnt/lvm/acios_db.ini 180 && sleep 10 && slay vdev-logvolmgr) &

/sbin/mme-becker $@
EOF
  chmod 777 /sbin/mme-becker.sh
fi

echo -ne "$runtstamp - Installation successful\r\n" >> $SDCARD/install.log
$SDCARD/utils/showScreen $SDCARD/screens/scriptDone.png
#slay -9 `pidin | grep -i 'navcore'`
/bin/rm -f /tmp/copie_scr.sh
echo > /tmp/copie_scr.sh