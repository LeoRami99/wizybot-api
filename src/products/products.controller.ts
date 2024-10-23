import { Controller, Post, Body } from '@nestjs/common';

import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
    constructor(public readonly aiProductsService: ProductsService) { }
    @Post('prompt')
    async getPromptSchema(@Body() body: { prompt: string }): Promise<any> {
        const response = await this.aiProductsService.aiPrompt(body.prompt);
        return response;
    }
}
