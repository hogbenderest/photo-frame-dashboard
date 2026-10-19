#!/bin/zsh
# Supplemental misc + frp capture for Fangor units 2 and 3 (2026-10-19).
# These partitions refuse reads via their partition nodes on every HK9365
# unit so far (vendor kernel hook; unit 1 had it too) - they read fine through
# the WHOLE-DISK device at the right sector offsets (unit-1 session-3 route):
#   misc: start 2301952, 32768 sectors (16 MiB)
#   frp:  start 4038656, 1024 sectors (512 KiB)
# Run after the main backup script; verifies sizes and rewrites SHA256SUMS.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ADB=/opt/homebrew/bin/adb
SLEEP=/bin/sleep
STAT=/usr/bin/stat
SHASUM=/usr/bin/shasum
GREP=/usr/bin/grep

# fix_unit <adb-serial> <backup-dir>
fix_unit() {
  local S=$1 OUT=$2
  cd $OUT || return 1
  echo "== $S -> $OUT"
  $ADB -s $S shell "su 0 sh -c 'if dumpsys power | grep -q mWakefulness=Awake; then input keyevent 26; fi'" >/dev/null 2>&1
  # misc via whole disk
  if [ $($STAT -f %z misc.img 2>/dev/null || echo 0) != 16777216 ]; then
    $ADB -s $S exec-out "su 0 sh -c 'dd if=/dev/block/mmcblk0 bs=512 skip=2301952 count=32768 2>/dev/null'" 2>/dev/null > misc.img
    echo "  misc: $($STAT -f %z misc.img 2>/dev/null) bytes (want 16777216)"
  else
    echo "  misc: already captured"
  fi
  # frp via whole disk
  if [ $($STAT -f %z frp.img 2>/dev/null || echo 0) != 524288 ]; then
    $ADB -s $S exec-out "su 0 sh -c 'dd if=/dev/block/mmcblk0 bs=512 skip=4038656 count=1024 2>/dev/null'" 2>/dev/null > frp.img
    echo "  frp: $($STAT -f %z frp.img 2>/dev/null) bytes (want 524288)"
  else
    echo "  frp: already captured"
  fi
  $SHASUM -a 256 *.img > SHA256SUMS.txt 2>/dev/null
}

fix_unit 192.168.86.196:5555 /Users/ian/photo-frame-dashboard/backups/fangor-114k-2/20261019
fix_unit 192.168.86.195:5555 /Users/ian/photo-frame-dashboard/backups/fangor-114k-3/20261019
echo FIXER-DONE
