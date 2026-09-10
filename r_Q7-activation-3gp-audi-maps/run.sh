#!/bin/ksh
sdcard=`ls /mnt|grep sdcard.*t`
dstPath=/mnt/$sdcard
runtstamp=`date +"%m/%d/%Y ""%T"`
mount -uw $dstPath
$dstPath/utils/showScreen $dstPath/utils/scriptStart.png
cd $dstPath
XX=`ls *.fsc | sed -n 1p`
if [ "$XX" != "" ]; then
 FullFile=$dstPath/$XX
 FSC=`echo $XX | sed -n -e 's/^.*\(_\)/\2/p'`
 Token=`echo $XX | sed -n -e 's/\(_\).*/\2/p'`
else 
$dstPath/utils/showScreen $dstPath/utils/scripterror1.png
  /bin/rm -f /tmp/copie_scr.sh
  echo > /tmp/copie_scr.sh
 exit 0
fi
/bin/mount -uw /mnt/efs-system
if test -a /sbin/mme-becker.sh ; then
  # check if second install
  XX=`/usr/bin/grep acios_db.ini /sbin/mme-becker.sh`
  if [ ! -z "$XX" ]
  then
    # already installed - uninstall first!
$dstPath/utils/showScreen $dstPath/utils/scripterror2.png
    /bin/rm -f /tmp/copie_scr.sh
    echo > /tmp/copie_scr.sh
    exit 0
  fi
  # backup mme-becker.sh for later uninstall
  /bin/cp /sbin/mme-becker.sh /sbin/mme-becker.sh.pre-navdb.bak
  # remove mme-becker launch line
  /usr/bin/sed "/\/sbin\/mme-becker/ d" < /sbin/mme-becker.sh > /sbin/mme-becker.sh.new
  /bin/mv /sbin/mme-becker.sh.new /sbin/mme-becker.sh
  cat << 'EOF' > /sbin/mme-becker.sh
#!/bin/ksh
if test -a /HBpersistence/DLinkReplacesPPP ; then
  (while true
   do
     XX=`ifconfig uap0 2>/dev/null`
     if [ ! -z "$XX" ]
     then
       while true
       do
         XX=`ifconfig uap0 | grep "alias"`
         if [ ! "$XX" == "" ]
         then
           exit 0
         fi
         /usr/sbin/dhcp.client -a -i uap0 -m -u
         sleep 1
       done
     fi
     sleep 1
   done) &
fi

(waitfor /mnt/lvm/acios_db.ini 180 && sleep 10 && slay vdev-logvolmgr) &

/sbin/mme-becker $@
EOF
chmod 777 /sbin/mme-becker.sh
else
  # first install
  /usr/bin/sed "s/\/mme-becker$/\/mme-becker.sh/" < /etc/mmelauncher.cfg > /etc/mmelauncher.cfg.new
  if ! test -a /etc/mmelauncher.cfg.orig ; then
    # just keep original version - so just do this the first time
    /bin/mv /etc/mmelauncher.cfg /etc/mmelauncher.cfg.pre-navdb.bak
  fi
  /bin/mv /etc/mmelauncher.cfg.new /etc/mmelauncher.cfg
  cat << 'EOF' > /sbin/mme-becker.sh
#!/bin/ksh
if test -a /HBpersistence/DLinkReplacesPPP ; then
  (while true
   do
     XX=`ifconfig uap0 2>/dev/null`
     if [ ! -z "$XX" ]
     then
       while true
       do
         XX=`ifconfig uap0 | grep "alias"`
         if [ ! "$XX" == "" ]
         then
           exit 0
         fi
         /usr/sbin/dhcp.client -a -i uap0 -m -u
         sleep 1
       done
     fi
     sleep 1
   done) &
fi

(waitfor /mnt/lvm/acios_db.ini 180 && sleep 10 && slay vdev-logvolmgr) &

/sbin/mme-becker $@
EOF
  chmod 777 /sbin/mme-becker.sh
fi
mount -uw /mnt/efs-persist/
rm -R -f /mnt/efs-persist/FSC/*
cp $FullFile /mnt/efs-persist/FSC/$FSC
echo -ne "$runtstamp - Installation successful - thanks to r_Q7 3GPLUS.RU\r\n" >> $dstPath/install.log
slay -9 `pidin | grep -i 'navcore'`
/bin/rm -f /tmp/copie_scr.sh
echo > /tmp/copie_scr.sh