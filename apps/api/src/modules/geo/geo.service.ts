import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppException } from '../../common/errors';
import { sha256 } from '../../common/utils/crypto';
import { REDIS } from '../../infra/redis/redis.module';

export type GeoResult = { title: string; subtitle: string; latitude: number; longitude: number; precise: boolean; kind: string };

const LANG: Record<string, string> = { uz: 'uz_UZ', ru: 'ru_RU', en: 'en_US' };
const CACHE_TTL_S = 24 * 3600;
// O'zbekiston chegarasi (taxminiy): natijalar shu oyna bilan cheklanadi
const UZ_BBOX = '55.9,37.1~73.2,45.6';

type YGeoObject = {
  name: string;
  description?: string;
  Point: { pos: string };
  metaDataProperty: { GeocoderMetaData: { precision: string; kind: string; text: string; Address?: { country_code?: string } } };
};

/** Yandex HTTP Geocoder proksisi: kalit serverda, javoblar Redis'da keshlanadi (limitni tejash). */
@Injectable()
export class GeoService {
  private readonly log = new Logger('Geo');

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  private get key() {
    const k = this.config.get<string>('YANDEX_GEOCODER_KEY');
    if (!k) throw new AppException('INTERNAL_ERROR', 'Geocoder is not configured');
    return k;
  }

  async search(q: string, lang: string, near?: { lat: number; lng: number }): Promise<GeoResult[]> {
    const params: Record<string, string> = { geocode: q, results: '8', bbox: UZ_BBOX, rspn: '0' };
    // Yaqin atrofdagi natijalar oldinda (joriy joy yoki Toshkent)
    if (near) Object.assign(params, { ll: `${near.lng},${near.lat}`, spn: '1.2,1.0' });
    const items = await this.request(params, lang);
    return items.filter((g) => !g.metaDataProperty.GeocoderMetaData.Address?.country_code || g.metaDataProperty.GeocoderMetaData.Address.country_code === 'UZ').map(toResult);
  }

  async reverse(lat: number, lng: number, lang: string): Promise<{ address: string | null }> {
    const items = await this.request({ geocode: `${lng},${lat}`, sco: 'longlat', kind: 'house', results: '1' }, lang);
    // Uy topilmasa (bo'sh joy) — eng yaqin ko'cha
    const fallback = items.length ? items : await this.request({ geocode: `${lng},${lat}`, sco: 'longlat', results: '1' }, lang);
    return { address: fallback[0]?.metaDataProperty.GeocoderMetaData.text ?? null };
  }

  private async request(params: Record<string, string>, lang: string): Promise<YGeoObject[]> {
    const qs = new URLSearchParams({ ...params, format: 'json', lang: LANG[lang] ?? 'uz_UZ' });
    const cacheKey = `geo:${sha256(qs.toString())}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    qs.set('apikey', this.key);
    const res = await fetch(`https://geocode-maps.yandex.ru/1.x/?${qs}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) {
      // Kalit/URL log'ga yozilmaydi
      this.log.warn(`geocoder HTTP ${res?.status ?? 'network error'}`);
      throw new AppException('INTERNAL_ERROR', 'Geocoder unavailable');
    }
    const json = (await res.json()) as { response: { GeoObjectCollection: { featureMember: { GeoObject: YGeoObject }[] } } };
    const items = json.response.GeoObjectCollection.featureMember.map((f) => f.GeoObject);
    await this.redis.set(cacheKey, JSON.stringify(items), 'EX', CACHE_TTL_S);
    return items;
  }
}

function toResult(g: YGeoObject): GeoResult {
  const [lng, lat] = g.Point.pos.split(' ').map(Number);
  const m = g.metaDataProperty.GeocoderMetaData;
  return { title: g.name, subtitle: g.description ?? '', latitude: lat, longitude: lng, precise: m.precision === 'exact' || m.kind === 'house', kind: m.kind };
}
