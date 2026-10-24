#!/bin/zsh
# Runs a command, ending it if the Mac's free memory falls under 25% (an MPS job can take the whole machine).
"$@" &
pid=$!
while kill -0 $pid 2> /dev/null; do
  free=$(memory_pressure | awk -F': ' '/free percentage/ {gsub("%","",$2); print $2}')
  if [[ -n $free && $free -lt 25 ]]; then
    echo "guard: free memory at ${free}%, ending $pid"
    kill $pid; sleep 3; kill -9 $pid 2> /dev/null
    exit 9
  fi
  sleep 2
done
wait $pid
