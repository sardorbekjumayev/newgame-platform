import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { AuthUser, CurrentUser, Public, RequirePermission } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
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
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsUUID('all', { each: true }) device_ids!: string[];
}

export class OperatorBookingsQuery {
  @ApiPropertyOptional({ example: '2026-11-16' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) date?: string;
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
}
