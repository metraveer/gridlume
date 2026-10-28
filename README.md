# Gridlume

**RU** · Вся ваша инфраструктура на одной схеме: серверы, роутеры, облако, контейнеры и связи между ними — видно с одного взгляда и управляется из одного места.

**EN** · Your whole infrastructure on one map: servers, routers, cloud, containers and the links between them — understood at a glance and managed from one place.

> Статус: идёт этап 2 — агент и живые данные. Что дальше — в [плане](docs/plan.md), решения — в [`docs/decisions.md`](docs/decisions.md).
>
> Status: stage 2 — agent and live data. What comes next is in the [plan](docs/plan.md); decisions are in [`docs/decisions.md`](docs/decisions.md).

## Запуск для разработки · Development

```bash
cd web && npm ci && cd ..
go run ./cmd/gridlume dev
```

Откройте · Open http://127.0.0.1:7420. Подробнее · More: [CONTRIBUTING.md](CONTRIBUTING.md).

## Как устроено · How it works

- **Ядро · Core** — одна программа на Go: веб-интерфейс, API, база. / One Go binary: web UI, API, storage.
- **Агент · Agent** — маленькая программа на каждой машине: метрики, Docker, логи, терминал. / A tiny program on each machine: metrics, Docker, logs, terminal.
- **Схема · Map** — узлы и связи на холсте, живой статус, действия с объяснениями и подтверждениями. / Nodes and links on a canvas, live status, actions with explanations and confirmations.

## Лицензия · License

[AGPL-3.0](LICENSE) — открытый код, бесплатно на условиях AGPL. Для компаний, которым эти условия не подходят, позже появятся коммерческая лицензия и платные функции.
Open source under AGPL-3.0, free under its terms. Companies that cannot accept those terms will later get a commercial license and paid features.
