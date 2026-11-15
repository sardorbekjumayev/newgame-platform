import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppException } from '../../common/errors';
import { PrismaService } from '../../database/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { AuthService, type ReqMeta } from './auth.service';

const MAX_AGE_S = 24 * 3600; // initData eskirishi

/**
 * Telegram Mini App (WebApp):
 * - `initData` imzosi bot tokeni bilan tekshiriladi (HMAC-SHA256, "WebAppData");
 * - Telegram foydalanuvchisi raqami botda ulashilgan bo'lsa (`telegram_links.tg_user_id`) — shu raqam bilan login;
 *   aks holda `need_contact` — Mini App `requestContact()` qiladi, kontakt botga keladi (OtpService.onContact bog'laydi).
 * - Bot menyu tugmasi va /start dan keyin "Bron qilish" web_app tugmasi (`TELEGRAM_WEBAPP_URL`, faqat https).
 */
@Injectable()
export class TelegramWebappService implements OnApplicationBootstrap {
  private readonly logger = new Logger('TelegramWebApp');

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly telegram: TelegramService,
    private readonly auth: AuthService,
  ) {}

  get url() {
    const u = this.config.get<string>('TELEGRAM_WEBAPP_URL')?.trim();
    return u && u.startsWith('https://') ? u.replace(/\/$/, '') : null;
  }

  async onApplicationBootstrap() {
    if (!this.telegram.enabled) return;
    if (!this.url) {
      this.logger.log('TELEGRAM_WEBAPP_URL (https) yo\'q — Mini App tugmasi o\'rnatilmadi');
      return;
    }
    await this.telegram
      .call('setChatMenuButton', { menu_button: { type: 'web_app', text: '🎮 Bron', web_app: { url: `${this.url}/tg` } } })
      .catch((e) => this.logger.warn(`setChatMenuButton: ${(e as Error).message}`));
    // Raqam bog'langach yoki bog'langan foydalanuvchi /start bosganda — Mini App tugmasi
    this.telegram.onLinked((chatId) => this.sendOpenButton(chatId));
  }

  async sendOpenButton(chatId: number) {
    if (!this.url) return;
    await this.telegram.sendMessage(chatId, '🎮 <b>Zonup</b>\n\nKlub tanlang va joyni shu yerning o\'zida bron qiling 👇', {
      reply_markup: { inline_keyboard: [[{ text: '🎮 Bron qilish', web_app: { url: `${this.url}/tg` } }]] },
    });
  }

  /** initData → Telegram foydalanuvchisi (imzo va muddat tekshiriladi). */
  verify(initData: string): { id: number; first_name?: string; last_name?: string; username?: string; language_code?: string } {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new AppException('UNAUTHORIZED', 'Telegram bot is not configured');
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash || !/^[0-9a-f]{64}$/.test(hash)) throw new AppException('UNAUTHORIZED', 'Invalid init data');
    params.delete('hash');
    const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
    const secret = createHmac('sha256', 'WebAppData').update(token).digest();
    const expected = createHmac('sha256', secret).update(check).digest();
    if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) throw new AppException('UNAUTHORIZED', 'Invalid init data');
    const authDate = Number(params.get('auth_date'));
    if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_S) throw new AppException('UNAUTHORIZED', 'Init data expired');
    const user = JSON.parse(params.get('user') ?? 'null') as { id: number } | null;
    if (!user?.id) throw new AppException('UNAUTHORIZED', 'Invalid init data');
    return user;
  }

  async login(initData: string, meta: ReqMeta) {
    const tg = this.verify(initData);
    const link = await this.prisma.telegram_links.findFirst({ where: { tg_user_id: BigInt(tg.id) }, orderBy: { updated_at: 'desc' } });
    if (!link) return { need_contact: true as const };
    const res = await this.auth.loginWithPhone(link.phone, meta);
    // Yangi mijozga Telegram ismini qo'yamiz (keyin profilda o'zgartiradi)
    if (!res.user.first_name && tg.first_name) {
      await this.prisma.users.update({ where: { id: res.user.id }, data: { first_name: tg.first_name.slice(0, 64), ...(tg.last_name ? { last_name: tg.last_name.slice(0, 64) } : {}) } });
      res.user = await this.auth.me(res.user.id);
    }
    return { need_contact: false as const, ...res };
  }
}
