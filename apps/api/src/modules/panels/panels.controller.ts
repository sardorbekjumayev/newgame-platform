import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { AuthUser, CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { PanelsService } from './panels.service';

const uuid = new ParseUUIDPipe();

export class LinkClubDto {
  @ApiProperty({ example: '4827193', description: 'Operator profilidagi 7 xonali User ID' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{7}$/, { message: 'public_id must be 7 digits' })
  public_id!: string;
}

export class ConfirmLinkDto {
  @ApiProperty({ example: '123456', description: 'Operator panelida ko\'ringan 6 xonali kod' })
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @Matches(/^\d{6}$/, { message: 'code must be 6 digits' })
  code!: string;
}

export class LocationDto {
  @ApiProperty({ example: 41.311081 }) @Type(() => Number) @IsLatitude() latitude!: number;
  @ApiProperty({ example: 69.240562 }) @Type(() => Number) @IsLongitude() longitude!: number;
  @ApiProperty({ required: false, description: 'Xaritadan aniqlangan yoki operator tuzatgan manzil' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() || undefined : value)) @IsOptional() @IsString() @MaxLength(300) address?: string;
}

export class RemovalRequestDto {
  @ApiProperty({ required: false, description: 'Sabab (super admin uchun)' })
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

@ApiTags('panels')
@ApiBearerAuth()
@Controller()
export class PanelsController {
  constructor(private readonly svc: PanelsService) {}

  @Get('operator/dashboard')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Operator: o\'z klubi, User ID, biriktirilgan menejerlar' })
  operator(@CurrentUser() u: AuthUser) {
    return this.svc.operatorDashboard(u.id);
  }

  @Post('operator/link-requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Operator: menejerning bog\'lanish so\'rovini rad etish' })
  reject(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.operatorReject(u.id, id, a);
  }

  @Put('operator/location')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Operator: klub joyini xaritada belgilash (birinchi kirishda majburiy)' })
  location(@Body() dto: LocationDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.setLocation(u.id, dto, a);
  }

  @Post('operator/managers/:managerId/removal-request')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Operator: menejerni olib tashlash so\'rovi → super admin tasdiqlaydi' })
  removal(@Param('managerId', uuid) managerId: string, @Body() dto: RemovalRequestDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.requestRemoval(u.id, managerId, dto.reason, a);
  }

  @Delete('operator/removal-requests/:id')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Operator: olib tashlash so\'rovini bekor qilish' })
  cancelRemoval(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.svc.cancelRemoval(u.id, id);
  }

  @Get('manager/link-requests')
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: kod kutilayotgan so\'rovlar' })
  requests(@CurrentUser() u: AuthUser) {
    return this.svc.managerRequests(u.id);
  }

  @RateLimit('sensitive')
  @Post('manager/link-requests/:id/confirm')
  @HttpCode(200)
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: operator aytgan kod bilan tasdiqlash → klub bog\'lanadi (5 urinish, 10 daqiqa)' })
  confirm(@Param('id', uuid) id: string, @Body() dto: ConfirmLinkDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.confirmLink(u.id, id, dto.code, a);
  }

  @Delete('manager/link-requests/:id')
  @RequirePermission('manager.dashboard')
  cancel(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.svc.cancelRequest(u.id, id);
  }

  @Get('manager/clubs')
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: biriktirilgan klublar' })
  managerClubs(@CurrentUser() u: AuthUser) {
    return this.svc.managerClubs(u.id);
  }

  @Get('manager/clubs/:clubId')
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: biriktirilgan klub — zonalar, tariflar, ish vaqti' })
  managerClub(@Param('clubId', uuid) clubId: string, @CurrentUser() u: AuthUser) {
    return this.svc.managerClub(u.id, clubId);
  }

  @RateLimit('sensitive')
  @Post('manager/link-requests')
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: operator User ID si → bog\'lanish so\'rovi (kod operator paneliga boradi)' })
  link(@Body() dto: LinkClubDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.requestLink(u.id, dto.public_id, a);
  }

  @RateLimit('sensitive')
  @Post('manager/clubs/:clubId/removal-request')
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: klubdan chiqish so\'rovi (super admin tasdiqlaydi)' })
  unlinkRequest(@Param('clubId', uuid) clubId: string, @Body() dto: RemovalRequestDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.requestUnlink(u.id, clubId, dto.reason, a);
  }

  @Delete('manager/removal-requests/:id')
  @RequirePermission('manager.dashboard')
  @ApiOperation({ summary: 'Menejer: klubdan chiqish so\'rovini bekor qilish' })
  cancelUnlink(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser) {
    return this.svc.cancelUnlink(u.id, id);
  }
}
