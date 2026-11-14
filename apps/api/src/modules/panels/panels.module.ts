import { Module } from '@nestjs/common';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';

/** Operator va menejer dashboard'lari. */
@Module({ controllers: [PanelsController], providers: [PanelsService] })
export class PanelsModule {}
