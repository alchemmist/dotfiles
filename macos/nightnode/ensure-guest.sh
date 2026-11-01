#!/bin/bash
# Runs inside the guest. Confirms the Apple NAT path reaches the API, then
# brings WireGuard and the k3s agent up. Exits non-zero if the API is unreachable.
set -euo pipefail
ok=0
for _ in $(seq 1 20); do
  code=$(curl -sk --max-time 3 -o /dev/null -w '%{http_code}' https://192.168.0.23:6443/cacerts || true)
  if [[ "$code" == "200" ]]; then
    ok=1
    break
  fi
  sleep 1
done
if [[ "$ok" != 1 ]]; then
  echo "guest cannot reach https://192.168.0.23:6443" >&2
  exit 1
fi
if [[ -f /etc/wireguard/wg-socrat.conf ]]; then
  sudo wg-quick up wg-socrat 2>/dev/null || true
  sudo systemctl enable wg-quick@wg-socrat >/dev/null 2>&1 || true
fi
if [[ -f /etc/systemd/system/k3s-agent.service ]]; then
  sudo systemctl start k3s-agent
fi
echo "api-ok"
