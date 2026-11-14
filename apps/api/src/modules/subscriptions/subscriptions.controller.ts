import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Actor, CurrentActor } from '../../common/decorators/actor.decorator';
import { RequirePermission } from '../../common/decorators/auth.decorators';
import { AssignSubscriptionDto, CreatePlanDto, ExtendSubscriptionDto, UpdatePlanDto } from './subscriptions.dto';
import { SubscriptionsService } from './subscriptions.service';

const uuid = new ParseUUIDPipe();

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('admin')
export class SubscriptionsController {
  constructor(private readonly svc: SubscriptionsService) {}

  @Get('plans')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Obuna rejalari (narx tiyinda, limit: zallar va qurilmalar)' })
  plans() {
    return this.svc.plans();
  }

  @Post('plans')
  @RequirePermission('platform.clubs.manage')
  createPlan(@Body() dto: CreatePlanDto, @CurrentActor() a: Actor) {
    return this.svc.createPlan(dto, a);
  }

  @Patch('plans/:id')
  @RequirePermission('platform.clubs.manage')
  updatePlan(@Param('id', uuid) id: string, @Body() dto: UpdatePlanDto, @CurrentActor() a: Actor) {
    return this.svc.updatePlan(id, dto, a);
  }

  @Get('subscriptions')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: 'Klublar obuna holati bilan: tugagan/tugayotganlar birinchi' })
  overview() {
    return this.svc.overview();
  }

  @Get('clubs/:id/subscription')
  @RequirePermission('platform.clubs.manage')
  clubSubscription(@Param('id', uuid) id: string) {
    return this.svc.clubSubscription(id);
  }

  @Put('clubs/:id/subscription')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: "Klubga obuna berish: reja + sinov (kun) + to'langan oylar; amaldagisi almashtiriladi" })
  assign(@Param('id', uuid) id: string, @Body() dto: AssignSubscriptionDto, @CurrentActor() a: Actor) {
    return this.svc.assign(id, dto, a);
  }

  @Post('clubs/:id/subscription/extend')
  @RequirePermission('platform.clubs.manage')
  @ApiOperation({ summary: "Uzaytirish (to'lov qabul qilindi): +N oy" })
  extend(@Param('id', uuid) id: string, @Body() dto: ExtendSubscriptionDto, @CurrentActor() a: Actor) {
    return this.svc.extend(id, dto, a);
  }

  @Delete('clubs/:id/subscription')
  @RequirePermission('platform.clubs.manage')
  cancel(@Param('id', uuid) id: string, @CurrentActor() a: Actor) {
    return this.svc.cancel(id, a);
  }
}
