#!/bin/bash
cd /root/mailhaven
git fetch origin main --quiet 2>/dev/null
CURRENT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
REMOTE=$(git rev-parse --short origin/main 2>/dev/null || echo "unknown")
BEHIND=$(git rev-list HEAD..origin/main --count 2>/dev/null || echo "0")
COMMITS=$(git log --oneline -5 origin/main 2>/dev/null | while IFS= read -r line; do
  hash=$(echo "$line" | cut -c1-7)
  msg=$(echo "$line" | cut -c9- | sed 's/"/\\"/g')
  echo "{\"hash\":\"$hash\",\"message\":\"$msg\"}"
done | paste -sd,)
echo "{\"currentCommit\":\"$CURRENT\",\"remoteCommit\":\"$REMOTE\",\"commitsBehind\":$BEHIND,\"latestCommits\":[${COMMITS}]}" > /root/mailhaven/data/git-status.json
