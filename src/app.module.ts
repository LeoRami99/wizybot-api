import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AiModule } from './ai/ai.module';
import { AiService } from './ai/ai.service';
import { ConfigModule } from '@nestjs/config';
import { ProductsModule } from './products/products.module';
import { ProductsService } from './products/products.service';

@Module({
  imports: [AiModule, ConfigModule.forRoot({
    envFilePath: '.env',
    isGlobal: true,
  }), ProductsModule],
  controllers: [AppController],
  providers: [AppService, ProductsService, AiService],
})
export class AppModule { }
