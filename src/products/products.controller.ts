import { Controller, Post, Body } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('Products')  // Grouping under "Products" for Swagger
@Controller('products')
export class ProductsController {
  constructor(public readonly aiProductsService: ProductsService) {}

  @Post('prompt')
  @ApiOperation({ summary: 'Send a prompt to the AI and get a response' })  // Description of the endpoint
  @ApiBody({  // Documenting the request body
    description: 'Send a prompt string to the AI',
    schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt you want to send to the AI',
          example: 'Describe the best features of a product',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'AI response for the given prompt' })  // Successful response documentation
  @ApiResponse({ status: 500, description: 'Validation error' })  // Error response documentation
  async getPromptSchema(@Body() body: { prompt: string }): Promise<any> {
    const response = await this.aiProductsService.aiPrompt(body.prompt);
    return response;
  }
}
