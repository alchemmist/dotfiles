#!/bin/bash

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root."
    exit
fi

# WireGuard Interface
wg_interface="wg0"

# Starting the VPN
# wg-quick up ${wg_interface}

# List of all the domains that will go through the VPN
domains=("youtube.com" "instagram.com")

# DNS Server used for domain name resolution
dns_servers=("1.0.0.1" "1.1.1.1")

# Default table id used by wg-quick
# table_id=51820

# Flush all the existing route from this table
# ip route flush table $table_id

# Get the ip address of each domain and add them in the routing table
for dns in "${dns_servers[@]}"; do
    for domain in "${domains[@]}"; do
        ips=$(dig +short @$dns $domain)
        for ip in $ips; do
            echo $ip
            # ip route add $ip dev $wg_interface table $table_id
        done
    done
done

# ip rule add from all lookup $table_id
