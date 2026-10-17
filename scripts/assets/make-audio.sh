#!/usr/bin/env bash
# Gera public/sfx/*.mp3 e public/music/battle.mp3 a partir de D:\Projetos\warlock-assets (mono, 44.1 kHz, pico em -1 dBFS nos sfx).
# bash scripts/assets/make-audio.sh <scratch-dir>
set -euo pipefail
A=/d/Projetos/warlock-assets; P=/d/Projetos/warlock/public; T=${1:?scratch dir}
mkdir -p "$P/sfx" "$P/music" "$T"

# sfx <fonte> <saida> <inicio> <duracao|0> <fade-out> [bitrate]
# corta o silêncio inicial, limita a duração, aplica fade-out e normaliza o pico para -1 dBFS
sfx() {
  local src=$1 out=$2 ss=$3 dur=$4 fade=$5 br=${6:-80k} wav="$T/$2.wav" f
  f="silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.02"
  [ "$dur" != 0 ] && f="$f,atrim=0:$dur,asetpts=PTS-STARTPTS"
  [ "$dur" != 0 ] && f="$f,afade=t=out:st=$(python -I -c "print(max(0,$dur-$fade))"):d=$fade"
  ffmpeg -v error -y -ss "$ss" -i "$src" -ac 1 -ar 44100 -af "$f" "$wav"
  norm_encode "$wav" "$P/sfx/$out.mp3" "$br"
}
norm_encode() {
  local wav=$1 out=$2 br=$3 mx gain
  mx=$(ffmpeg -hide_banner -i "$wav" -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB/\1/p')
  gain=$(python -I -c "print(round(-1-($mx),2))")
  ffmpeg -v error -y -i "$wav" -af "volume=${gain}dB" -ac 1 -ar 44100 -c:a libmp3lame -b:a "$br" "$out"
  echo "$(basename "$out"): max_in=${mx}dB gain=${gain}dB"
}

sfx "$A/oga-fireball/105016__julien-matthey__jm-fx-fireball-01.wav" fireball 0 2.3 0.12
sfx "$A/kenney-scifi/x/Audio/explosionCrunch_000.ogg" explode 0 0 0
sfx "$A/kenney-scifi/x/Audio/forceField_000.ogg" shield 0 0 0
sfx "$A/oga-spells/teleport.ogg" teleport 0.70 1.2 0.12      # primeira das 3 takes (0.74-1.82 s)
sfx "$A/oga-spells/electricspell2.ogg" lightning 8.95 1.2 0.2 # trecho mais forte (pico ~9.5 s)
sfx "$A/oga-magicspell/magical_7_0.ogg" homing 0 0 0         # mais brilhante (centroide ~3.5 kHz)
sfx "$A/kenney-impact/x/Audio/impactPunch_heavy_000.ogg" hit 0 0 0
sfx "$A/kenney-interface/x/Audio/click_001.ogg" click 0 0 0
sfx "$A/kenney-interface/x/Audio/confirmation_001.ogg" confirm 0 0 0

# lava_loop: crossfade de 0.4 s entre o fim e o início, para o laço não estalar
X=0.4; SRC="$A/oga-firecrackle/fire-1_0.ogg"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
ffmpeg -v error -y -i "$SRC" -ac 1 -ar 44100 -filter_complex \
 "[0:a]asplit=3[a][b][c];[a]atrim=$(python -I -c "print($D-$X)"):$D,asetpts=PTS-STARTPTS[tail];[b]atrim=0:$X,asetpts=PTS-STARTPTS[head];[c]atrim=$X:$(python -I -c "print($D-$X)"),asetpts=PTS-STARTPTS[mid];[tail][head]acrossfade=d=$X:c1=qsin:c2=qsin[cf];[cf][mid]concat=n=2:v=0:a=1[o]" \
 -map "[o]" "$T/lava_loop.wav"
norm_encode "$T/lava_loop.wav" "$P/sfx/lava_loop.mp3" 64k

# música: sem corte (é laço), mono 64 kbps
ffmpeg -v error -y -i "$A/oga-battle/determined_pursuit_loop.wav" -ac 1 -ar 44100 -c:a libmp3lame -b:a 64k "$P/music/battle.mp3"
