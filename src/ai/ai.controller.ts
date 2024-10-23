import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { getPromptSchema } from './dto/get-prompt/get-prompt.dto';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';

@ApiTags('AI')  // Grouping endpoints under "AI" for Swagger
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('prompt')
  @ApiOperation({ summary: 'Get the result of a prompt' })  // Brief description of the endpoint
  @ApiBody({  // Details of the request body
    description: 'Body to send the prompt to the AI',
    schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The prompt to be sent to the AI',
          example: 'Write a poem about the sea',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Prompt result' })  // Response documentation for success
  @ApiResponse({ status: 500, description: 'Validation error' })  // Response documentation for errors
  async getPromptSchema(@Body() body: { prompt: string }) {
    const { error, value } = getPromptSchema.validate(body);
    if (error) {
      throw new Error(`Validation error: ${error.message}`);
    }
    return this.aiService.getPrompt(value.prompt);
  }
}
