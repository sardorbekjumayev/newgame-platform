import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthUser, CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { clientIp, userAgent } from '../../common/utils/request';
import { AuthService } from './auth.service';
import { LoginDto, RefreshDto, TelegramWebappDto, SendOtpDto, SetPasswordDto, UpdateMeDto, VerifyOtpDto } from './dto/auth.dto';
import { OtpService } from './otp.service';
import { TelegramWebappService } from './telegram-webapp.service';
import { TokenService } from './token.service';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';

const meta = (req: Request, device?: Record<string, unknown>) => ({
  ip: clientIp(req),
  user_agent: userAgent(req),
  request_id: (req.headers['x-request-id'] as string) ?? null,
  device_info: { ...(device ?? {}), user_agent: userAgent(req) },
});

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly otp: OtpService,
    private readonly auth: AuthService,
    private readonly tgWebapp: TelegramWebappService,
    private readonly tokens: TokenService,
  ) {}

  @RateLimit('sensitive')
  @Public()
  @Post('send-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login kodi Telegram bot orqali: bog\'langan bo\'lsa kod botga keladi, aks holda bot_url qaytadi (dev, token yo\'q: 000000)' })
  sendOtp(@Body() dto: SendOtpDto, @Req() req: Request) {
    return this.otp.send(dto.phone, dto.purpose, clientIp(req));
  }

  @RateLimit('sensitive')
  @Public()
  @Post('verify-otp')
  @HttpCode(200)
  @ApiOperation({ summary: 'OTP tasdiqlash → login yoki ro\'yxatdan o\'tish' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Req() req: Request) {
    await this.otp.verify(dto.phone, dto.code);
    return this.auth.loginWithPhone(dto.phone, meta(req, dto.device));
  }

  @RateLimit('sensitive')
  @Public()
  @Post('telegram-webapp')
  @HttpCode(200)
  @ApiOperation({ summary: 'Telegram Mini App: initData bilan kirish (raqam botda ulashilmagan bo\'lsa need_contact)' })
  telegramWebapp(@Body() dto: TelegramWebappDto, @Req() req: Request) {
    return this.tgWebapp.login(dto.init_data, meta(req, { platform: 'telegram-webapp' }));
  }

  @RateLimit('sensitive')
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login (email|telefon + parol) — staff, super admin, parolli customer' })
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.loginWithPassword(dto.login, dto.password, meta(req, dto.device));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Refresh token rotation' })
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.tokens.rotate(dto.refresh_token, { ip: clientIp(req) });
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  async logout(@Body() dto: RefreshDto, @CurrentUser() user: AuthUser) {
    await this.tokens.revoke(dto.refresh_token, user.id);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(@CurrentUser() user: AuthUser) {
    await this.tokens.revokeAll(user.id);
    return { ok: true };
  }

  @RateLimit('sensitive')
  @ApiBearerAuth()
  @Post('password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Parol o\'rnatish/o\'zgartirish' })
  async setPassword(@Body() dto: SetPasswordDto, @CurrentUser() user: AuthUser) {
    await this.auth.setPassword(user.id, dto.password);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi + rollar + permissionlar' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ summary: 'O\'z profilini tahrirlash (ism, familiya, til, email)' })
  updateMe(@Body() dto: UpdateMeDto, @CurrentUser() user: AuthUser) {
    return this.auth.updateMe(user.id, dto);
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() user: AuthUser) {
    return this.tokens.listSessions(user.id, user.sid);
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  async revokeSession(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.tokens.revokeSession(user.id, id);
    return { ok: true };
  }
}
