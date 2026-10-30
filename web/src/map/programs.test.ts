import { expect, it } from 'vitest'
import en from '../i18n/en.json'
import ru from '../i18n/ru.json'
import { programOf, programProto } from './programs'

it('recognises programs by image, whatever the registry, tag or digest', () => {
  expect(programOf('postgres:17')?.key).toBe('postgres')
  expect(programOf('docker.io/library/postgres:16-alpine')?.name).toBe('PostgreSQL')
  expect(programOf('ghcr.io/home-assistant/home-assistant:stable')?.key).toBe('hass')
  expect(programOf('vaultwarden/server:latest')?.key).toBe('vault')
  expect(programOf('jc21/nginx-proxy-manager:2')?.name).toBe('Nginx Proxy Manager')
  expect(programOf('nginx@sha256:abc')?.key).toBe('nginx')
  expect(programOf('ghcr.io/immich-app/immich-server:release')?.key).toBe('photos')
  expect(programOf('registry.local:5000/team/redis:7')?.key).toBe('redis')
  expect(programOf('my-own-app:1.0')).toBeNull()
  expect(programOf(undefined)).toBeNull()
  expect(programProto(programOf('mariadb:11')!)).toBe('MySQL · 3306')
})

it('has texts for every program in both languages', () => {
  const images = ['postgres', 'mariadb', 'redis', 'mongo', 'elasticsearch', 'influxdb', 'rabbitmq', 'eclipse-mosquitto', 'nginx', 'traefik', 'nextcloud', 'jellyfin', 'home-assistant', 'zigbee2mqtt', 'grafana', 'prometheus', 'portainer-ce', 'pihole', 'wg-easy', 'vaultwarden', 'gitea', 'immich-server', 'paperless-ngx', 'uptime-kuma', 'minio', 'n8n', 'syncthing', 'qbittorrent']
  for (const image of images) {
    const p = programOf(image)
    expect(p, image).not.toBeNull()
    for (const dict of [ru, en] as Record<string, string>[]) {
      for (const part of ['what', 'broken', 'link']) expect(dict[`prog.${p!.key}.${part}`], `${image} ${part}`).toBeTruthy()
    }
  }
})
