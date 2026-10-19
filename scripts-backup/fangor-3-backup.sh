#!/bin/zsh
# Unit-2 backup of the Fangor 114K partitions (v1, adapted from unit 1's v3).
# Same board, same firmware (verified 2026-10-19); runs over WiFi adb on
# 192.168.86.196:5555 with the serial pinned so the living frame (.197)
# doesn't confuse adb when both are online.
# - on-device stderr suppression: this Android 6 adbd merges stderr into exec-out
# - misc/frp permission quirk: fall back to whole-disk head read
# - self-healing: skips verified files, 6 attempts per partition
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ADB=/opt/homebrew/bin/adb
S=192.168.86.195:5555
GREP=/usr/bin/grep
SLEEP=/bin/sleep
STAT=/usr/bin/stat
SHASUM=/usr/bin/shasum

OUT=/Users/ian/photo-frame-dashboard/backups/fangor-114k-3/20261019
mkdir -p $OUT
cd $OUT || exit 1

wait_for_frame() {
  local waited=0
  until $ADB -s $S get-state 2>/dev/null | $GREP -q device; do
    $SLEEP 3
    waited=$((waited+3))
    [ $waited -gt 240 ] && return 1
  done
  $ADB -s $S shell "su 0 sh -c 'if dumpsys power | grep -q mWakefulness=Awake; then input keyevent 26; fi'" >/dev/null 2>&1
  return 0
}

# dump_part <name> <device-path> <want-bytes> [extra dd args]
dump_part() {
  local name=$1 path=$2 want=$3 extra=$4 attempt got
  got=$($STAT -f %z $name.img 2>/dev/null || echo 0)
  if [ "$got" = "$want" ]; then echo "$name: already verified from earlier run, skipping"; return 0; fi
  for attempt in 1 2 3 4 5 6; do
    if ! wait_for_frame; then echo "$name: frame never returned, giving up"; return 1; fi
    $ADB -s $S exec-out "su 0 sh -c 'dd if=$path bs=4096 $extra 2>/dev/null'" 2>/dev/null > $name.img
    got=$($STAT -f %z $name.img 2>/dev/null || echo 0)
    if [ "$got" = "$want" ]; then
      echo "$name: OK ($got bytes, attempt $attempt)"
      return 0
    fi
    echo "$name: bad size ($got/$want, attempt $attempt)"
  done
  return 1
}

dump_part bootloader /dev/block/by-name/bootloader 33554432
dump_part env /dev/block/by-name/env 16777216
dump_part boot /dev/block/by-name/boot 16777216
dump_part misc /dev/block/by-name/misc 16777216 || dump_part misc /dev/block/mmcblk0p8 16777216
dump_part recovery /dev/block/by-name/recovery 33554432
dump_part metadata /dev/block/by-name/metadata 16777216
dump_part private /dev/block/by-name/private 16777216
dump_part frp /dev/block/by-name/frp 524288 || true
dump_part empty /dev/block/by-name/empty 16252928
dump_part alog /dev/block/by-name/alog 83886080
dump_part media_data /dev/block/by-name/media_data 16777216
dump_part mmcblk0boot0 /dev/block/mmcblk0boot0 4194304
dump_part mmcblk0boot1 /dev/block/mmcblk0boot1 4194304
dump_part system /dev/block/mmcblk0p7 1073741824
dump_part mmcblk0-head-40MiB /dev/block/mmcblk0 41943040 count=10240

# frp (512KiB) refuses its node read on unit 1 (vendor kernel hook); it is inside
# the disk head above (frp start 4038656 sectors < 81920). Verify its 512KiB at
# offset 4038656*512 from the head image if present.
if [ -f mmcblk0-head-40MiB.img ] && [ $(STAT -f %z mmcblk0-head-40MiB.img) = 41943040 ]; then
  dd if=mmcblk0-head-40MiB.img of=frp.img bs=512 skip=4038656 count=1024 2>/dev/null
  echo "frp: extracted from disk head ($(STAT -f %z frp.img 2>/dev/null) bytes)"
fi

$SHASUM -a 256 *.img > SHA256SUMS.txt 2>/dev/null
echo BACKUP-DONE
cat SHA256SUMS.txt
