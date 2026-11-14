import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { AuthUser, CurrentUser, RequirePermission } from '../../common/decorators/auth.decorators';
import { CreateTariffDto, CreateZoneDto, UpdateTariffDto, UpdateZoneDto, WorkingHoursDto } from './club-settings.dto';
import { ClubSettingsService } from './club-settings.service';

const uuid = new ParseUUIDPipe();

@ApiTags('operator')
@ApiBearerAuth()
@Controller('operator')
export class ClubSettingsController {
  constructor(private readonly svc: ClubSettingsService) {}

  @Get('zones')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Klub zonalari (tariflar soni bilan)' })
  zones(@CurrentUser() u: AuthUser) {
    return this.svc.zones(u.id);
  }

  @Post('zones')
  @RequirePermission('operator.dashboard')
  createZone(@Body() dto: CreateZoneDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.createZone(u.id, dto, a);
  }

  @Patch('zones/:id')
  @RequirePermission('operator.dashboard')
  updateZone(@Param('id', uuid) id: string, @Body() dto: UpdateZoneDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.updateZone(u.id, id, dto, a);
  }

  @Delete('zones/:id')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Zonani o\'chirish (uning tariflari ham)' })
  deleteZone(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.deleteZone(u.id, id, a);
  }

  @Get('tariffs')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Tariflar (narx — tiyin)' })
  tariffs(@CurrentUser() u: AuthUser) {
    return this.svc.tariffs(u.id);
  }

  @Post('tariffs')
  @RequirePermission('operator.dashboard')
  createTariff(@Body() dto: CreateTariffDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.createTariff(u.id, dto, a);
  }

  @Patch('tariffs/:id')
  @RequirePermission('operator.dashboard')
  updateTariff(@Param('id', uuid) id: string, @Body() dto: UpdateTariffDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.updateTariff(u.id, id, dto, a);
  }

  @Delete('tariffs/:id')
  @RequirePermission('operator.dashboard')
  deleteTariff(@Param('id', uuid) id: string, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.deleteTariff(u.id, id, a);
  }

  @Get('working-hours')
  @RequirePermission('operator.dashboard')
  workingHours(@CurrentUser() u: AuthUser) {
    return this.svc.workingHours(u.id);
  }

  @Put('working-hours')
  @RequirePermission('operator.dashboard')
  @ApiOperation({ summary: 'Ish vaqti (haftalik; 24/7 — always_open)' })
  setWorkingHours(@Body() dto: WorkingHoursDto, @CurrentUser() u: AuthUser, @CurrentActor() a: Actor) {
    return this.svc.setWorkingHours(u.id, dto.working_hours, a);
  }
}
