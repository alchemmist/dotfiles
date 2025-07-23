#!/usr/bin/env python3

import subprocess
import re
from pathlib import Path

# Список доменов
domains = [
    "youtube.com",
    "instagra.com",
    "chatgpt.com",
]

# DNS-серверы, через которые будем делать запросы
dns_servers = ["1.0.0.1", "1.1.1.1"]

# Путь к конфигу
conf_path = Path("/home/alchemmist/sweet-mist.conf")

# Регэксп для IPv4
ipv4_re = re.compile(r'(\d{1,3}(?:\.\d{1,3}){3})')

def dig_lookup(domain: str, server: str) -> set[str]:
    """
    Выполняет dig @server www.domain. A и возвращает множество найденных IPv4.
    """
    cmd = ["dig", f"@{server}", f"www.{domain}.", "A", "+noall", "+answer"]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        ips = set(ipv4_re.findall(result.stdout))
        return ips
    except subprocess.CalledProcessError as e:
        print(f"[ERROR] dig for {domain} via {server} failed: {e}")
        return set()

def update_allowed_ips(conf_path: Path, new_ips: set[str]) -> None:
    """
    Открывает конфиг, находит строку AllowedIPs,
    добавляет новые IP/32 и сохраняет файл.
    """
    lines = conf_path.read_text().splitlines()
    out_lines = []
    for line in lines:
        if line.strip().startswith("AllowedIPs"):
            key, existing = line.split("=", 1)
            existing_ips = [ip.strip() for ip in existing.split(",") if ip.strip()]
            existing_set = set(existing_ips)
            for ip in new_ips:
                ip32 = f"{ip}/32"
                if ip32 not in existing_set:
                    existing_ips.append(ip32)
            new_line = f"{key.strip()} = {', '.join(existing_ips)}"
            out_lines.append(new_line)
        else:
            out_lines.append(line)
    conf_path.write_text("\n".join(out_lines) + "\n")

def main():
    all_new_ips: set[str] = set()
    for domain in domains:
        domain_ips: set[str] = set()
        for server in dns_servers:
            ips = dig_lookup(domain, server)
            if ips:
                print(f"[+] {domain} via {server}: {len(ips)} IP(s)")
                domain_ips.update(ips)
            else:
                print(f"[!] {domain} via {server}: no A-records found")
        all_new_ips.update(domain_ips)

    if not all_new_ips:
        print("Новых IP не найдено, файл не будет обновлен.")
        return

    print(f"Добавляем в конфиг {len(all_new_ips)} IP(адресов)...")
    update_allowed_ips(conf_path, all_new_ips)
    print("Готово.")

if __name__ == "__main__":
    main()

