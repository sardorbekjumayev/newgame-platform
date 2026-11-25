import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { PanelsController } from './panels.controller';
import { PanelsService } from './panels.service';

/** Operator va menejer dashboard'lari. */
@Module({ imports: [MediaModule], controllers: [PanelsController], providers: [PanelsService] })
export class PanelsModule {}
