import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorators';
import { CreateClubDto, CreateManagerDto, CredentialsResponse, ListQuery, RemovalDecisionDto, RemovalListQuery, UpdateClubDto, UserStatusDto } from './accounts.dto';
import { AccountsService } from './accounts.service';

const uuid = new ParseUUIDPipe();

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AccountsController {
  constructor(private readonly svc: AccountsService) {}

  @Get('stats')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Super admin dashboard: arizalar, klublar, menejerlar soni' })
  stats() {
    return this.svc.stats();
  }

  @Post('clubs')
  @RequirePermission('platform.clubs.manage')
  @ApiCreatedResponse({ description: 'club_id + operator login/parol (parol faqat shu javobda)' })
  @ApiOperation({ summary: 'Klub (filial) + operator akkaunti yaratish; application_id bo\'lsa ariza APPROVED' })
  createClub(@Body() dto: CreateClubDto, @CurrentActor() a: Actor) {
    return this.svc.createClub(dto, a);
  }

  @Get('clubs')
  @RequirePermission('platform.clubs.manage')
  listClubs(@Query() q: ListQuery) {
    return this.svc.listClubs(q);
  }

  @Get('clubs/:id')
  @RequirePermission('platform.clubs.manage')
  getClub(@Param('id', uuid) id: string) {
    return this.svc.getClub(id);
  }

  @Patch('clubs/:id')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Klub ma\'lumotlari va holati (ACTIVE | SUSPENDED)' })
  updateClub(@Param('id', uuid) id: string, @Body() dto: UpdateClubDto, @CurrentActor() a: Actor) {
    return this.svc.updateClub(id, dto, a);
  }

  @Post('managers')
  @RequirePermission('platform.managers.manage')
  @ApiCreatedResponse({ type: CredentialsResponse })
  @ApiOperation({ summary: 'Menejer akkaunti (login/parol; parol faqat shu javobda)' })
  createManager(@Body() dto: CreateManagerDto, @CurrentActor() a: Actor) {
    return this.svc.createManager(dto, a);
  }

  @Get('managers')
  @RequirePermission('platform.managers.manage')
  listManagers(@Query() q: ListQuery) {
    return this.svc.listManagers(q);
  }

  @RateLimit('sensitive')
  @Post('users/:id/reset-password')
  @HttpCode(200)
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Operator/menejer: vaqtinchalik parol (sessiyalar bekor, birinchi kirishda almashtiriladi)' })
  resetPassword(@Param('id', uuid) id: string, @CurrentActor() a: Actor) {
    return this.svc.resetPassword(id, a);
  }

  @Patch('users/:id/status')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Operator/menejer: ACTIVE | BLOCKED' })
  setStatus(@Param('id', uuid) id: string, @Body() dto: UserStatusDto, @CurrentActor() a: Actor) {
    return this.svc.setStatus(id, dto.status, a);
  }

  @Get('removal-requests')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Operatorlarning menejerni olib tashlash so\'rovlari (aloqa ma\'lumotlari bilan)' })
  removals(@Query() q: RemovalListQuery) {
    return this.svc.listRemovals(q);
  }

  @Post('removal-requests/:id/approve')
  @HttpCode(200)
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Tasdiqlash → menejer klubdan olib tashlanadi' })
  approveRemoval(@Param('id', uuid) id: string, @Body() dto: RemovalDecisionDto, @CurrentActor() a: Actor) {
    return this.svc.decideRemoval(id, true, dto.admin_note, a);
  }

  @Post('removal-requests/:id/reject')
  @HttpCode(200)
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Rad etish → menejer klubda qoladi' })
  rejectRemoval(@Param('id', uuid) id: string, @Body() dto: RemovalDecisionDto, @CurrentActor() a: Actor) {
    return this.svc.decideRemoval(id, false, dto.admin_note, a);
  }
}
