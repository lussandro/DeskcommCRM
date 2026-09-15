# Base da VPS — 2026-09-15

Plano 4, Task 2. VPS `2.25.222.110`, CentOS Stream 10.

## Incidente: Docker não subia no kernel da imagem

`systemctl enable --now docker` falhou. Journal do `dockerd`:

```
failed to start daemon: Error initializing network controller: ... failed to add jump rules to ipv4 NAT table:
(iptables failed: iptables --wait -t nat -A PREROUTING -m addrtype --dst-type LOCAL -j DOCKER:
Warning: Extension addrtype revision 0 not supported, missing kernel module?
iptables v1.8.11 (nf_tables):  RULE_APPEND failed (No such file or directory): rule in chain PREROUTING
```

Investigação (só leitura):

| Módulo | kernel `6.12.0-264` (em execução) | kernel `6.12.0-267` |
|---|---|---|
| `xt_addrtype` | ausente | `kernel/net/netfilter/xt_addrtype.ko.xz` |
| `nft_compat` | ausente | presente |
| `br_netfilter` | ausente | presente |
| `xt_MASQUERADE`, `xt_conntrack`, `iptable_nat` | ausentes | presentes |

O kernel `6.12.0-267` (+ `kernel-modules-extra`) entrou com a transação `dnf install docker-ce` e já era o padrão de boot (`grubby --default-kernel`). Causa-raiz: kernel em execução sem os módulos de netfilter que o Docker exige. Não é SELinux (disabled) nem firewalld (inativo).

Correção (uma mudança): `systemctl reboot` → `uname -r` = `6.12.0-267.el10.x86_64`; `modprobe xt_addrtype nft_compat br_netfilter` ok; `systemctl restart docker` → `active`; `docker run --rm hello-world` → "Hello from Docker!".

## Estado após a Task 2

```
docker 29.8.0, cgroup v2, storage overlayfs
docker0: inet 172.17.0.1/16
swap: /swapfile 4.0Gi ativo (fstab)
nginx 1.26.3 (appstream), ativo
certbot 4.2.0 (EPEL 10, CRB habilitado)
rede docker bacco_proxy: 10.231.0.0/24
portas em escuta: *:9090 (cockpit) 0.0.0.0:22 0.0.0.0:80 [::]:22 [::]:80
memória: 7.5Gi total, 527Mi usado; swap 4.0Gi livre
pacotes: docker-ce-29.8.0-1.el10, nginx-1.26.3-15.el10, certbot-4.2.0-1.el10_2, kernel-core 264 e 267
```
