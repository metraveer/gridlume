/**
 * Known programs, recognised by their Docker image, so a container and the links to it explain
 * themselves: what it is, what stops without it, and how others talk to it. Texts are in the
 * dictionaries (prog.<key>.what / .broken / .link); names are the programs' own and need no translation.
 */
export type Program = { key: string; name: string; proto?: string; port?: number }

// Matched against the image without tag and registry: the last path part ("postgres"), or the whole
// path for images whose last part says nothing ("vaultwarden/server").
const PROGRAMS: [RegExp, Program][] = [
  [/^(postgres|postgis|timescaledb)$/, { key: 'postgres', name: 'PostgreSQL', proto: 'PostgreSQL', port: 5432 }],
  [/^mariadb$/, { key: 'mysql', name: 'MariaDB', proto: 'MySQL', port: 3306 }],
  [/^mysql$/, { key: 'mysql', name: 'MySQL', proto: 'MySQL', port: 3306 }],
  [/^(redis|valkey|keydb)$/, { key: 'redis', name: 'Redis', proto: 'Redis', port: 6379 }],
  [/^(mongo|mongodb)$/, { key: 'mongo', name: 'MongoDB', proto: 'MongoDB', port: 27017 }],
  [/^(elasticsearch|opensearch)$/, { key: 'search', name: 'Elasticsearch', proto: 'HTTP', port: 9200 }],
  [/^influxdb$/, { key: 'influx', name: 'InfluxDB', proto: 'HTTP', port: 8086 }],
  [/^rabbitmq$/, { key: 'rabbitmq', name: 'RabbitMQ', proto: 'AMQP', port: 5672 }],
  [/^(eclipse-mosquitto|mosquitto|emqx)$/, { key: 'mqtt', name: 'MQTT', proto: 'MQTT', port: 1883 }],
  [/^nginx-proxy-manager$/, { key: 'proxy', name: 'Nginx Proxy Manager', proto: 'HTTP', port: 80 }],
  [/^(nginx|openresty)$/, { key: 'nginx', name: 'nginx', proto: 'HTTP', port: 80 }],
  [/^traefik$/, { key: 'proxy', name: 'Traefik', proto: 'HTTP', port: 80 }],
  [/^caddy$/, { key: 'proxy', name: 'Caddy', proto: 'HTTP', port: 80 }],
  [/^nextcloud$/, { key: 'nextcloud', name: 'Nextcloud', proto: 'HTTP', port: 80 }],
  [/^jellyfin$/, { key: 'media', name: 'Jellyfin', proto: 'HTTP', port: 8096 }],
  [/^(pms-docker|plex)$/, { key: 'media', name: 'Plex', proto: 'HTTP', port: 32400 }],
  [/^home-assistant$/, { key: 'hass', name: 'Home Assistant', proto: 'HTTP', port: 8123 }],
  [/^zigbee2mqtt$/, { key: 'z2m', name: 'Zigbee2MQTT' }],
  [/^grafana$/, { key: 'grafana', name: 'Grafana', proto: 'HTTP', port: 3000 }],
  [/^prometheus$/, { key: 'prometheus', name: 'Prometheus', proto: 'HTTP', port: 9090 }],
  [/^portainer(-ce|-ee)?$/, { key: 'portainer', name: 'Portainer', proto: 'HTTPS', port: 9443 }],
  [/^pihole$/, { key: 'dns', name: 'Pi-hole', proto: 'DNS', port: 53 }],
  [/^adguardhome$/, { key: 'dns', name: 'AdGuard Home', proto: 'DNS', port: 53 }],
  [/^(wireguard|wg-easy)$/, { key: 'vpn', name: 'WireGuard', proto: 'WireGuard', port: 51820 }],
  [/^vaultwarden\/server$|^vaultwarden$/, { key: 'vault', name: 'Vaultwarden', proto: 'HTTP', port: 80 }],
  [/^(gitea|forgejo)$/, { key: 'git', name: 'Gitea', proto: 'HTTP', port: 3000 }],
  [/^immich-server$/, { key: 'photos', name: 'Immich', proto: 'HTTP', port: 2283 }],
  [/^paperless-ngx$/, { key: 'paperless', name: 'Paperless-ngx', proto: 'HTTP', port: 8000 }],
  [/^uptime-kuma$/, { key: 'uptime', name: 'Uptime Kuma', proto: 'HTTP', port: 3001 }],
  [/^minio$/, { key: 'minio', name: 'MinIO', proto: 'S3', port: 9000 }],
  [/^n8n$/, { key: 'n8n', name: 'n8n', proto: 'HTTP', port: 5678 }],
  [/^syncthing$/, { key: 'syncthing', name: 'Syncthing', proto: 'HTTP', port: 8384 }],
  [/^(qbittorrent|transmission)$/, { key: 'torrent', name: 'BitTorrent', proto: 'HTTP', port: 8080 }],
]

/** The program an image runs, or null. Tags, digests and registries do not matter. */
export function programOf(image: string | undefined): Program | null {
  if (!image) return null
  let i = image.toLowerCase()
  i = i.split('@')[0] ?? i
  const path = i.replace(/^[^/]+\.[^/]+\//, '') // a registry host ("ghcr.io/") goes
  const noTag = path.replace(/:[^/]*$/, '')
  const last = noTag.slice(noTag.lastIndexOf('/') + 1)
  for (const [re, p] of PROGRAMS) if (re.test(last) || re.test(noTag)) return p
  return null
}

/** "PostgreSQL · 5432": what a link to this program says it is. */
export function programProto(p: Program) {
  return [p.proto, p.port].filter(Boolean).join(' · ')
}
