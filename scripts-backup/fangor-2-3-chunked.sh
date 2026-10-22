#!/bin/zsh
# Chunked, resumable system-partition capture for Fangor units over WiFi adb.
# The 1 GiB single-stream dump is fragile over the XR819 (each drop restarts
# from zero); this pulls 64 MiB chunks, verifies each by size, skips ones
# already captured, and assembles the final image only when all 16 are good.
# Also captures the 40 MiB whole-disk head (misc/frp fixer source) + runs the
# misc/frp whole-disk offsets. Leaves a final SHA256SUMS.txt.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
ADB=/opt/homebrew/bin/adb
SLEEP=/bin/sleep
STAT=/usr/bin/stat
SHASUM=/usr/bin/shasum
GREP=/usr/bin/grep

CHUNK=32            # MiB per chunk (completes in ~140s at observed rate, well under watchdog)
TOTAL=1073741824    # system partition bytes
NCHUNKS=$((TOTAL / CHUNK / 1048576))   # 16

# chunk_unit <adb-serial> <backup-dir>
chunk_unit() {
  local S=$1 OUT=$2 i got want skip
  cd $OUT || return 1
  echo "== $S -> $OUT (system in $NCHUNKS chunks of ${CHUNK}MiB)"
  rm -f system.img   # discard any earlier single-stream partial

  wake $S
  for i in $(seq 0 $((NCHUNKS-1))); do
    want=$((CHUNK * 1048576))
    got=$($STAT -f %z sys32-chunk-$i.img 2>/dev/null || echo 0)
    if [ "$got" = "$want" ]; then echo "  chunk $i: already verified, skipping"; continue; fi
    for attempt in 1 2 3 4 5 6; do
      wake $S
      skip=$((i * CHUNK))
      # watchdog: the XR819 leaves hung streams half-open forever; kill after
      # 300s so the retry loop actually loops (no coreutils timeout on macOS,
      # so use a zsh background job + kill pattern)
      ( $ADB -s $S exec-out "su 0 sh -c 'dd if=/dev/block/mmcblk0p7 bs=1048576 skip=$skip count=$CHUNK 2>/dev/null'" 2>/dev/null > sys32-chunk-$i.img ) &
      local pid=$!
      # radio keepalive: ping the gateway FROM THE FRAME (adb shell keeps its
      # own radio transmitting; the Mac's pings are ignored). Runs while the
      # dd stream is alive, 5s interval.
      ( while kill -0 $pid 2>/dev/null; do sleep 5; $ADB -s $S shell "ping -c 1 -W 1 192.168.86.1" >/dev/null 2>&1; done ) &
      local kapid=$!
      ( sleep 300; kill -9 $pid 2>/dev/null ) &
      local wpid=$!
      wait $pid 2>/dev/null
      kill $wpid $kapid 2>/dev/null
      got=$($STAT -f %z sys32-chunk-$i.img 2>/dev/null || echo 0)
      if [ "$got" = "$want" ]; then echo "  chunk $i: OK (attempt $attempt)"; break; fi
      echo "  chunk $i: bad size ($got/$want, attempt $attempt)"
    done
    if [ "$got" != "$want" ]; then echo "  chunk $i FAILED after 6 attempts; re-run this script to resume"; return 1; fi
  done

  cat sys32-chunk-*.img > system.img
  got=$($STAT -f %z system.img)
  if [ "$got" = "$TOTAL" ]; then
    echo "  system.img assembled: $got bytes"
    rm -f sys32-chunk-*.img
  else
    echo "  assembly size mismatch ($got); keeping chunks for manual recovery"; return 1
  fi

  # whole-disk head (40 MiB) - the misc/frp source
  if [ $($STAT -f %z mmcblk0-head-40MiB.img 2>/dev/null || echo 0) != 41943040 ]; then
    wake $S
    $ADB -s $S exec-out "su 0 sh -c 'dd if=/dev/block/mmcblk0 bs=1048576 count=40 2>/dev/null'" 2>/dev/null > mmcblk0-head-40MiB.img
    echo "  disk head: $($STAT -f %z mmcblk0-head-40MiB.img 2>/dev/null) bytes (want 41943040)"
  else
    echo "  disk head: already captured"
  fi

  # misc + frp via whole-disk offsets (unit-1 proven route)
  if [ $($STAT -f %z misc.img 2>/dev/null || echo 0) != 16777216 ]; then
    $ADB -s $S exec-out "su 0 sh -c 'dd if=/dev/block/mmcblk0 bs=512 skip=2301952 count=32768 2>/dev/null'" 2>/dev/null > misc.img
    echo "  misc (whole-disk): $($STAT -f %z misc.img 2>/dev/null) bytes"
  fi
  if [ $($STAT -f %z frp.img 2>/dev/null || echo 0) != 524288 ]; then
    $ADB -s $S exec-out "su 0 sh -c 'dd if=/dev/block/mmcblk0 bs=512 skip=4038656 count=1024 2>/dev/null'" 2>/dev/null > frp.img
    echo "  frp (whole-disk): $($STAT -f %z frp.img 2>/dev/null) bytes"
  fi

  $SHASUM -a 256 *.img > SHA256SUMS.txt 2>/dev/null
  echo "  SHA256SUMS.txt written"
}

wake() {
  local S=$1 waited=0
  until $ADB -s $S get-state 2>/dev/null | $GREP -q device; do
    $SLEEP 3
    waited=$((waited+3))
    [ $waited -gt 120 ] && return 1
  done
  $ADB -s $S shell "su 0 sh -c 'if dumpsys power | grep -q mWakefulness=Awake; then input keyevent 26; fi'" >/dev/null 2>&1
  return 0
}

chunk_unit 192.168.86.196:5555 /Users/ian/photo-frame-dashboard/backups/fangor-114k-2/20261019
chunk_unit 192.168.86.195:5555 /Users/ian/photo-frame-dashboard/backups/fangor-114k-3/20261019
echo CHUNKED-BACKUP-DONE
