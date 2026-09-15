# Pré-condições do deploy — medidas em 2026-09-15

Plano: `docs/superpowers/plans/2026-09-15-bacco-plano-4-ci-deploy-vps.md`, Task 0.

## DNS

```
$ dig +short A adega-crm.baccosistemas.com.br
2.25.222.110
$ dig +short A api-adega.baccosistemas.com.br
2.25.222.110
```

Sem AAAA. NS Cloudflare; registros DNS-only (a resposta é o IP da VPS).

## VPS (`root@2.25.222.110`, acesso por chave)

```
PRETTY_NAME="CentOS Stream 10 (Coughlan)"
nproc: 2
Mem: 7.5Gi total
/dev/sda3 100G 3.7G 97G 4% /
portas em escuta: *:9090 (cockpit) 0.0.0.0:22 [::]:22
```

SELinux `disabled`; firewalld e nftables inativos; sem Docker; sem `git`. Saída TCP para `smtp.resend.com` nas portas 465, 587, 2465, 2587 e 25 liberada.

## CI da base na `main` (fork sem mudança de código, commit `336b9c97`)

| Workflow | Resultado |
|---|---|
| `ci` / `verify` | failure — passo Typecheck: `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`, exit 134 (run 34979163506). Lint, unit e `test:shell` não chegaram a rodar |
| `ci` / `invariants` (`test:db`) | success |
| `perf` (build) | success |
| `Publicar imagem Docker (GHCR)` | success |

Achado do refutador sobre o mesmo commit: a remoção de `acolhida.yml`, `relogio.yml`, `release.yml` e a troca do gatilho do `e2e.yml` quebrariam o `test:unit` (21 testes leem esses arquivos) — corrigido na Task 1 restaurando os arquivos e desligando os workflows no GitHub.

Dependabot abriu os PRs #1 e #2 (execuções canceladas, PRs fechados com comentário); `.github/dependabot.yml` sai na Task 1.
