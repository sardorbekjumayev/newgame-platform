import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { UZ_PHONE } from '../auth/dto/auth.dto';
import { BookingsService } from './bookings.service';

const uuid = new ParseUUIDPipe();

export class SlotsQuery {
  @ApiProperty({ example: '2026-11-16' }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @ApiProperty({ example: 120 }) @Type(() => Number) @IsInt() @Min(30) @Max(720) duration!: number;
}

export class AvailabilityQuery {
  @ApiProperty() @IsDateString() start_at!: string;
  @ApiProperty({ example: 120 }) @Type(() => Number) @IsInt() @Min(30) @Max(720) duration!: number;
}

export class CreateBookingDto {
  @ApiProperty() @IsUUID() club_id!: string;
  @ApiProperty() @IsDateString() start_at!: string;
  @ApiProperty({ example: 120 }) @Type(() => Number) @IsInt() @Min(30) @Max(720) duration_minutes!: number;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(5) @IsUUID('all', { each: true }) device_ids!: string[];
  @ApiPropertyOptional({ example: '+998901234567', description: "Aloqa raqami — operator shu raqamga qo'ng'iroq qiladi. Bo'sh — akkaunt raqami" })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/[\s()-]/g, '') : value))
  @IsOptional()
  @Matches(UZ_PHONE, { message: 'contact_phone must be in +998XXXXXXXXX format' })
  contact_phone?: string;
}

export class OperatorBookingsQuery {
  @ApiPropertyOptional({ example: '2026-11-16' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
}

export class OperatorAvailabilityQuery {
  @ApiPropertyOptional({ description: "Bo'sh — hozir" }) @IsOptional() @IsDateString() start_at?: string;
  @ApiPropertyOptional({ example: 120, description: 'open=1 da kerak emas' }) @ValidateIf((o) => !o.open) @Type(() => Number) @IsInt() @Min(30) @Max(720) duration?: number;
  @ApiPropertyOptional({ description: "1 — ochiq vaqt uchun: hozirdan, narx soatiga, har bir joy qachongacha bo'sh (free_until)" }) @IsOptional() @IsIn(['1', 'true']) open?: string;
}

export class WalkInDto {
  @ApiPropertyOptional({ description: "Bo'sh — hozir" }) @IsOptional() @IsDateString() start_at?: string;
  @ApiPropertyOptional({ example: 120, description: 'open=true da kerak emas' }) @ValidateIf((o) => !o.open) @Type(() => Number) @IsInt() @Min(30) @Max(720) duration_minutes?: number;
  @ApiPropertyOptional({ description: "Ochiq vaqt: hozirdan boshlanadi, tugashi noma'lum — operator to'xtatadi (POST .../stop), summa o'shanda hisoblanadi" }) @IsOptional() @IsBoolean() open?: boolean;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsUUID('all', { each: true }) device_ids!: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) guest_name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) guest_phone?: string;
  @ApiPropertyOptional({ description: 'Hozir boshlansa — darhol «Keldi» (default true)' }) @IsOptional() @IsBoolean() check_in?: boolean;
}

export class ContactDto {
  @ApiProperty({ enum: ['NEW', 'CONFIRMED', 'PREPAID', 'NO_ANSWER'] }) @IsIn(['NEW', 'CONFIRMED', 'PREPAID', 'NO_ANSWER']) contact_status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

@ApiTags('bookings')
@Controller()
export class BookingsController {
  constructor(private readonly svc: BookingsService) {}

  @Public()
  @Get('clubs/:id/booking/slots')
  @ApiOperation({ summary: 'Kun bo\'yicha bron vaqtlari (30 daqiqa qadam) va bo\'sh qurilmalar soni' })
  slots(@Param('id', uuid) id: string, @Query() q: SlotsQuery) {
    return this.svc.slots(id, q.date, q.duration);
  }

  @Public()
  @Get('clubs/:id/booking/availability')
  @ApiOperation({ summary: 'Tanlangan vaqt: zonalar, narx, sxema, qurilmalar holati' })
  availability(@Param('id', uuid) id: string, @Query() q: AvailabilityQuery) {
    return this.svc.availability(id, q.start_at, q.duration);
  }

  @ApiBearerAuth()
  @RateLimit('sensitive')
  @Post('bookings')
  @ApiOperation({ summary: "Bron (faqat ro'yxatdan o'tgan mijoz; to'lov klubda; ≤5 faol, 5 kun oldin)" })
  create(@Body() dto: CreateBookingDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.create(u, dto, a);
  }

  @ApiBearerAuth()
  @Get('me/booking-contact')
  @ApiOperation({ summary: "Bron formasi uchun aloqa raqami: oxirgi bronda ishlatilgani, bo'lmasa akkaunt raqami" })
  contactPhone(@CurrentUser() u: AuthUser) {
    return this.svc.contactPhone(u);
  }

  @ApiBearerAuth()
  @Get('me/bookings')
  mine(@CurrentUser() u: AuthUser) {
    return this.svc.mine(u);
  }

  @ApiBearerAuth()
  @Get('me/bookings/:id')
  get(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.svc.get(u, id);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('me/bookings/:id/cancel')
  @ApiOperation({ summary: 'Bekor qilish — boshlanishiga kamida 1 soat qolganda' })
  cancel(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.cancelByCustomer(u, id, a);
  }

  @ApiBearerAuth()
  @Get('operator/bookings')
  @RequirePermission('operator.dashboard')
  operatorList(@Query() q: OperatorBookingsQuery, @CurrentUser() u: AuthUser) {
    return this.svc.operatorList(u.id, q.date);
  }

  @ApiBearerAuth()
  @Get('operator/bookings/upcoming')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Kutilayotgan bronlar (yangilari birinchi)' })
  operatorUpcoming(@CurrentUser() u: AuthUser) {
    return this.svc.operatorUpcoming(u.id);
  }

  @ApiBearerAuth()
  @Get('operator/bookings/availability')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Joyida bron uchun bo\'sh o\'rindiqlar (start_at bo\'sh — hozir)' })
  operatorAvailability(@Query() q: OperatorAvailabilityQuery, @CurrentUser() u: AuthUser) {
    return this.svc.operatorAvailability(u.id, q.start_at, q.duration ?? 0, !!q.open);
  }

  @ApiBearerAuth()
  @Post('operator/bookings/walk-in')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Joyida bron — klubga o\'zi kelgan mijoz (akkaunt ixtiyoriy)' })
  operatorWalkIn(@Body() dto: WalkInDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorWalkIn(u.id, dto, a);
  }

  @ApiBearerAuth()
  @Get('operator/bookings/by-code/:code')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Kod bo\'yicha bron' })
  operatorByCode(@Param('code') code: string, @CurrentUser() u: AuthUser) {
    return this.svc.operatorByCode(u.id, code.slice(0, 20));
  }

  @ApiBearerAuth()
  @Put('operator/bookings/:id/contact')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Mijoz bilan bog\'lanish natijasi' })
  operatorContact(@Param('id', uuid) id: string, @Body() dto: ContactDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorContact(u.id, id, dto.contact_status, dto.note, a);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('operator/bookings/:id/stop')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: "Ochiq sessiyani to'xtatish — summa shu paytgacha (soatlik tarif, daqiqasiga) hisoblanadi" })
  operatorStop(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorStop(u.id, id, a);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('operator/bookings/:id/check-in')
  @RequirePermission('operator.dashboard')
  checkIn(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorAction(u.id, id, 'check-in', a);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('operator/bookings/:id/no-show')
  @RequirePermission('operator.dashboard')
  noShow(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorAction(u.id, id, 'no-show', a);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('operator/bookings/:id/cancel')
  @RequirePermission('operator.dashboard')
  operatorCancel(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorAction(u.id, id, 'cancel', a);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('operator/bookings/:id/undo-check-in')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: "Xato bosilgan «Keldi»ni qaytarish" })
  operatorUndoCheckIn(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorUndoCheckIn(u.id, id, a);
  }
}
