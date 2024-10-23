import { Controller, Post, Body } from '@nestjs/common';
import { AiService } from './ai.service';
import { getPromptSchema } from './dto/get-prompt/get-prompt.dto';

@Controller('ai')
export class AiController {
    constructor(private readonly aiService: AiService) { }
    @Post('prompt')
    async getPromptSchema(@Body() body: { prompt: string }) {
        const { error, value } = getPromptSchema.validate(body);
        if (error) {
            throw new Error(`Validation error: ${error.message}`)
        }
        return this.aiService.getPrompt(value.prompt);
    }


}
